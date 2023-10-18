// #!/usr/bin/env node
const express = require("express");
const mysql = require("mysql");
const pkg = require("@atproto/api");
const BskyAgent = pkg.BskyAgent;
const app = express();
const verbose = true;

require("dotenv").config();
app.set("views", "./pages");
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.static(__dirname + "/public"));
process.stdin.setEncoding("utf8");

const fetch = require("node-fetch");
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
global.fetch = fetch;
// const chalk = require('chalk');
// const ProgressBar = require('progress');
// const humanizeDuration = require('humanize-duration');

// //Database Imports
// const { Op } = require('sequelize');

// Create connection
const db = mysql.createConnection({
	host: "localhost",
  	user: "vikas",
  	password: "database",
  	database: "bluesky_db",
  	port: 3306,
});

db.connect((err) => {
  	if (err) {
		console.error("Error connecting to MySQL:", err);
  	}
});

app.listen("3000", () => {
});

process.stdin.once("data", (input) => {
	input = input.trim();
	if (input === "stop") {
    	console.log("Shutting down the server");
    	process.exit(0);
	}
});

// Check if environment variables are defined
if (!process.env.BLUESKY_USERNAME || !process.env.BLUESKY_PASSWORD) {
	console.error("Env variables are not defined!");
	process.exit(1);
}

app.get("/", (request, response) => {
	const sql = "CREATE DATABASE IF NOT EXISTS bluesky_db";
	db.query(sql, (err, result) => {
    if (err) {
    	throw err;
    }
    console.log("Database created or already exists:", result);
    res.send("Database created or already exists...");
	});
	let profileTableSQL = `
		CREATE TABLE IF NOT EXISTS profiles (
		id INT AUTO_INCREMENT PRIMARY KEY,
		did VARCHAR(255) NOT NULL UNIQUE,
		handle VARCHAR(255) NOT NULL,
		display_name VARCHAR(255),
		description VARCHAR(255),
		follows_count INT,
		followers_count INT,
		posts_count INT,
		indexed_at DATETIME
		)
`;
	db.query(profileTableSQL, (err, result) => {
	if (err) {
		throw err;
	}
	console.log(result);
	res.send("Profile table created...");
	});
	
	
	let postsTableSQL = `
	CREATE TABLE IF NOT EXISTS posts (
		id INT AUTO_INCREMENT PRIMARY KEY,
		profile_id INT NOT NULL,
		uri VARCHAR(255) NOT NULL UNIQUE,
		url VARCHAR(255) NOT NULL UNIQUE,
		cid VARCHAR(255) NOT NULL UNIQUE,
		text VARCHAR(255),
		created_at DATETIME NOT NULL,
		reply_count INT NOT NULL,
		repost_count INT NOT NULL,
		like_count INT NOT NULL,
		indexed_at DATETIME NOT NULL,
		FOREIGN KEY (profile_id) REFERENCES profiles(id)
	)
`;
	db.query(postsTableSQL, (err, result) => {
	if (err) {
		throw err;
	}
	console.log(result);
	res.send("Post table created...");
	});

	response.render("index.ejs");
});

const agent = new BskyAgent({ service: "https://bsky.social"});

// Convert URI to URL
async function urlFromUri(username, uri) {
	let parts = uri.split("/");
	let postID = parts[parts.length - 1];
	return `https://bsky.app/profile/${username}/post/${postID}`;
}
// Get a profile by DID
function retriveProfileUsingDID(did) {
    return new Promise((resolve, reject) => {
        const profileQuery = `SELECT * FROM profiles WHERE did = '${did}' LIMIT 1`;
        db.query(profileQuery, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result[0]);
            }
        });
    });
}

function getPostByUri(uri) {
    return new Promise((resolve, reject) => {
        const postQuery = `SELECT * FROM posts WHERE uri = '${uri}' LIMIT 1`;
        db.query(postQuery, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result[0]); // Assuming you want to return the first result
            }
        });
    });
}

// Insert or update a profile to the database
async function insertOrUpdateProfile(profileData) {
	const profile = await retriveProfileUsingDID(profileData.did);
	if (!profile){
		// Create Profile
		try {
			let post = {
				did: profileData.did,
				handle: profileData.handle || '',
				display_name: profileData.displayName || '',
				description: profileData.description || '',
				follows_count: profileData.followsCount,
				followers_count: profileData.followersCount,
				posts_count: profileData.postsCount,
				indexed_at: profileData.indexedAt || new Date().toISOString().slice(0, 19).replace('T', ' ')
			};
			let sql = 'INSERT INTO profiles SET ?'
			db.query(sql, post, (err, result) => {
			if (err) {
				throw err;
			}
			console.log(result);
		  });
	  } catch (error) {
			console.error(`Error creating post with did: ${profileData.did}.`);
			throw error;
		}
		console.log(`New profile created for ${profileData.handle}`);
	} else {
		// Post exists, update it
		try {
			let updatePost = `UPDATE profiles
			SET handle = ${profileData.handle},
			    display_name = ${profileData.displayName},
				description = ${profileData.description},
				follows_count = ${profileData.follows_count},
				followers_count = ${profileData.followers_count},
				posts_count = ${profileData.posts_count}
				indexed_at = ${profileData.indexedAt}
			WHERE did = ${profileData.did}`;
			db.query(updatePost, (err, result) => {
			if (err) {
				throw err;
			}
			console.log(result);
		  });
		} catch (error) {
			console.error(`Profile updated with did: ${profileData.did}.`);
			throw error;
		}
        console.log(`Existing profile updated for ${profileData.handle}`);
	}

    return profile;
}

// Insert or update all posts associated with the user
async function insertOrUpdatePost(verboseOutput, postData) {
	const post = await getPostByUri(postData.uri);
	if (!post){
		// Get author profile
		let profile = await insertOrUpdatePost({
			did: postData.author.did,
            handle: postData.author.handle,
            displayName: postData.author.displayName,
            indexedAt: postData.indexedAt
		});
		// Create Post
		try {
			let post = {
				profile_id: profile.id,
				uri: postData.uri,
				cid: postData.cid,
				text: postData.record.text,
				created_at: postData.record.createdAt,
				reply_count: postData.replyCount,
				repost_count: postData.repostCount,
				like_count: postData.likeCount,
				indexed_at: postData.indexedAt,
				url: await urlFromUri(postData.author.handle, postData.uri)
			};
			let sql = 'INSERT INTO posts SET ?'
			db.query(sql, post, (err, result) => {
			if (err) {
				throw err;
			}
			console.log(result);
		  });
	  } catch (error) {
			console.error(`Error creating post with uri: ${postData.uri}.`);
			throw error;
		}
		console.log(`New post created with URL: ${post.url}`);
	} else {
		// Post exists, update it
		try {
			let updatePost = `UPDATE posts
			SET reply_count = ${postData.replyCount},
				repost_count = ${postData.repostCount},
				like_count = ${postData.likeCount},
				indexed_at = ${postData.indexedAt},
			WHERE uri = ${postData.uri};`;
			db.query(updatePost, (err, result) => {
			if (err) {
				throw err;
			}
			console.log(result);
		  });
		} catch (error) {
			console.error(`Post updated with uri: ${postData.uri}.`);
			throw error;
		}
		console.log(`Existing post updated with URL: ${post.url}`);
	}
	if (verboseOutput) {
        console.log(postData);
    }
    return post;
}

// Fetch Profile Information and Post Information
async function fetchProfile(argv) {
    console.log(`Loading profile: ${argv}`);
    let profileData = null;

    // Load the profile from the API
    try {
        const returnValue = await agent.getProfile({ actor: argv });
        profileData = returnValue.data;
    } catch (error) {
        console.error(`Error: Failed to fetch user ${argv}`);
        return;
    }

    // Add the profile to the database
    let profile = await insertOrUpdateProfile(profileData);
	let connections = 0;
	let postsCnt = 0;
	// let connections = profileData.follows_count + profileData.followers_count;
	// let postsCnt = profileData.posts_count;
    if (connections > 0) {
        const followsRes = await agent.getFollows({ actor: argv });
        const followersRes = await agent.getFollowers({ actor: argv });

        const followDIDs = [];
        for (let i = 0; i < followsRes.data.follows.length; i++) {
            const f = followsRes.data.follows[i];
            if (verbose) {
                console.log(f);
            }
            await insertOrUpdateProfile(f);
            followDIDs.push(f.did);
        }

        const followerDIDs = [];
        for (let i = 0; i < followersRes.data.followers.length; i++) {
            const f = followersRes.data.followers[i];
            if (verbose) {
                console.log(f);
            }
            await insertOrUpdateProfile(f);
            followerDIDs.push(f.did);
        }

    }

    // Load all of the profile's posts
    let posts = [];
    let cursor = null;
	let counter = 0;
    while ((counter < postsCnt) && true) {
        try {
            // Make the API request
            let params = { actor: profile.handle, limit: 100 }
            if (cursor) {
                params.cursor = cursor;
            }
            const returnValue = await agent.getAuthorFeed(params);
            posts = returnValue.data.feed;
            cursor = returnValue.data.cursor;
            if (!cursor) {
                break;
            }
			counter += 1;
        } catch (error) {
            console.error(error);
            return;
        }
		
        // Add the posts to the database
        for (let postData of posts) {
            await insertOrUpdatePost(verbose, postData.post);
        }
    }
}

function readInput() {
	return new Promise((resolve, reject) => {
	  process.stdout.write('Enter a command: ');
	  process.stdin.once('data', (input) => {
		input = input.trim();
		if (input === 'stop') {
		  console.log('Shutting down the server');
		  process.exit(0);
		} else if (input.startsWith('fetch ')) {
		  const username = input.split(' ')[1];
		  fetchProfile(username)
			.then(() => resolve())
			.catch((error) => reject(error));
		} else {
		  console.log(`Invalid command: ${input}`);
		  resolve();
		}
	  });
	});
  }
  
async function startServer() {
	while (true) {
	  	try {
			await readInput();
	  	} catch (error) {
			console.error('An error occurred:', error);
		}
	}
}
// Fix Update Queries and Posts

// Search Function by Username

// Read and Display All Posts on Website

// Page to insert to database and page to view all posts of a profile

//MAIN METHOD
(async () => {
	try {
        await agent.login({
            identifier: process.env.BLUESKY_USERNAME,
            password: process.env.BLUESKY_PASSWORD,
        });
    } catch (error) {
        console.error(`Error: Failed to login. Please check your BLUESKY_USERNAME and BLUESKY_PASSWORD. ${process.env.BLUESKY_USERNAME} and ${process.env.BLUESKY_PASSWORD}}`);
		throw(error);
    }
	startServer();
})();