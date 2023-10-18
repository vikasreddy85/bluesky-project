const express = require("express");
const mysql = require("mysql");
const pkg = require("@atproto/api");
const chalk = require('chalk');
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
global.fetch = fetch;

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
		did VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY,
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
		profile_id INT NOT NULL PRIMARY KEY,
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
                resolve(result[0]);
            }
        });
    });
}

async function getProfileByID(id) {
    return new Promise((resolve, reject) => {
        const postQuery = `
            SELECT
                profiles.id,
                profiles.handle,
                posts.text AS post_text,
                posts.created_at AS post_created_at,
                posts.reply_count,
                posts.repost_count,
                posts.like_count,
                posts.url
            FROM
                posts
            JOIN
                profiles ON posts.profile_id = profiles.id
            WHERE
                profiles.id = ${id};
        `;

        db.query(postQuery, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result[0]); 
            }
        });
    });
}

async function getAllPosts(handle) {
    return new Promise((resolve, reject) => {
        if (!handle) {
            reject(new Error('Invalid handle: Handle is required'));
            return;
        }
        const profileQuery = `SELECT id FROM profiles WHERE handle = '${handle}'`;
        db.query(profileQuery, (err, profileResult) => {
            if (err) {
                reject(err);
                return;
            }
            const profileId = profileResult[0]?.id;
            if (!profileId) {
                reject(new Error('Profile not found for the given handle'));
                return;
            }

            const postQuery = `SELECT * FROM posts WHERE profile_id = ${profileId}`;
            db.query(postQuery, (err, postResult) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(postResult);
                }
            });
        });
    });
}

async function getProfileRetID(profile) {
    return new Promise((resolve, reject) => {
        const deletePostsQuery = 'SELECT id FROM profiles WHERE did = ?';
        db.query(deletePostsQuery, [profile.author.did], (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result[0].id);
            }
        });
    });
}


async function deleteTable() {
    try {
        // Delete posts associated with profiles
        await deletePosts();

        // Delete profiles
        await deleteProfiles();

        console.log('Deletion successful.');
    } catch (error) {
        console.error('Error deleting records:', error);
    }
}

async function deletePosts() {
    return new Promise((resolve, reject) => {
        const deletePostsQuery = `DELETE FROM posts;`;
        db.query(deletePostsQuery, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function deleteProfiles() {
    return new Promise((resolve, reject) => {
        const deleteProfilesQuery = `DELETE FROM profiles;`;
        db.query(deleteProfilesQuery, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

// Insert or update a profile to the database
async function insertOrUpdateProfile(profileData) {
	const profile = await retriveProfileUsingDID(profileData.did);
	let formattedIndexedAt = '';
	if (profileData.indexedAt instanceof Date && !isNaN(profileData.indexedAt)) {
		formattedIndexedAt = profileData.indexedAt.toISOString().slice(0, 19).replace('T', ' ');
	}  else {
		const today = new Date();
		formattedIndexedAt = today.toISOString().slice(0, 19).replace('T', ' ');
	}

	if (!profile){
		// Create Profile
		try {
			let post = {
				did: profileData.did,
				handle: profileData.handle || '',
				display_name: profileData.displayName || '',
				description: profileData.description || '',
				follows_count: profileData.followsCount || 0,
				followers_count: profileData.followersCount || 0,
				posts_count: profileData.postsCount || 0,
				indexed_at: formattedIndexedAt
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
			let updatePost = 
			`UPDATE profiles
			SET handle = ?,
			    display_name = ?,
				description = ?,
				follows_count = ?,
				followers_count = ?,
				posts_count = ?,
				indexed_at = ?
			WHERE did = ?`;
			db.query(updatePost, [
				profileData.did,
				profileData.handle || '',
				profileData.displayName || '',
				profileData.description || '',
				profileData.followsCount || 0,
				profileData.followersCount || 0,
				profileData.postsCount || 0,
				profileData.indexedAt = formattedIndexedAt
			], (err, result) => {
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
	let formattedIndexedAt = '';
	let formattedCreatedAt = '';
	if (postData.indexedAt instanceof Date && !isNaN(postData.indexedAt)) {
		formattedIndexedAt = postData.indexedAt.toISOString().slice(0, 19).replace('T', ' ');
	} else {
		const today = new Date();
		formattedIndexedAt = today.toISOString().slice(0, 19).replace('T', ' ');
	}
	if (postData.createdAt instanceof Date && !isNaN(postData.createdAt)) {
		formattedCreatedAt = postData.createdAt.toISOString().slice(0, 19).replace('T', ' ');
	} else {
		const today = new Date();
		formattedCreatedAt = today.toISOString().slice(0, 19).replace('T', ' ');
	}
	
	if (!post){
		// Get author profile
		let profile = await insertOrUpdateProfile({
			did: postData.author.did,
            handle: postData.author.handle,
            displayName: postData.author.displayName,
            indexedAt: formattedIndexedAt
		});

		// Create Post
		try {
			let profileRetID;
			if (profile && profile.id !== undefined) {
				profileRetID = await getProfileRetID(postData);
			}else if (profile){
				profileRetID = profile.id;
			}else{
				console.log(profile);
			}
			let post = {
				profile_id: profileRetID,
				uri: postData.uri || '',
				cid: postData.cid || '',
				text: postData.record.text.replace(/[^\x20-\x7E\xA0-\xD7FF\xE000-\xFFFF]/g, '') || '',
				created_at: formattedCreatedAt,
				reply_count: postData.replyCount || 0,
				repost_count: postData.repostCount || 0,
				like_count: postData.likeCount || 0,
				indexed_at: formattedIndexedAt,
				url: await urlFromUri(postData.author.handle, postData.uri) || ''
			};
			if (post.text.length > 255) {
				return post.text.slice(0, 252) + '...';
			  }
			let sql = 'INSERT INTO posts SET ?'
			db.query(sql, post, (err, result) => {
			if (err) {
				throw err;
			}
			console.log(result);
		  });
		  console.log(`New post created with URL: ${post.url}`);
	  } catch (error) {
			console.error(`Error creating post with uri: ${postData.uri}.`);
			throw error;
		}
	} else {
		// Post exists, update it
		try {
			let updatePost = `UPDATE posts
			SET reply_count = ?,
				repost_count = ?,
				like_count = ?,
				indexed_at = ?
			WHERE uri = ?;`;
			db.query(updatePost, [postData.replyCount || 0, postData.repostCount || 0,  postData.likeCount || 0, formattedIndexedAt, postData.uri], (err, result) => {
			if (err) {
				throw err;
			}
			console.log(result);
		  });
		  console.log(`Existing post updated with URL: ${post.url}`);
		} catch (error) {
			console.error(`Post updated with uri: ${postData.uri}.`);
			throw error;
		}
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
	// Load all of the profile's posts
	let postsCnt = profileData.postsCount;
    let posts = [];
    let cursor = null;
	let counter = 0;
    while ((counter < postsCnt) && true) {
        try {
            // Make the API request
            let params = { actor: profileData.handle, limit: 100 }
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

// Read and Display All Posts on Website
async function displayPost(post) {
    try {
        const profile = await getProfileByID(post.profile_id);

        console.log(chalk.bold(profile.handle) + `: ${post.text}`);
        console.log(chalk.dim(`${post.created_at}`));
        console.log(chalk.dim(`Replies: ${post.reply_count}, Reposts: ${post.repost_count}, Likes: ${post.like_count}`));
        console.log(chalk.cyanBright.underline(post.url));
        console.log();
    } catch (error) {
        console.error('Error displaying post:', error);
    }
}

async function readPosts(argv) {
    try {
        const posts = await getAllPosts(argv);
        console.log(`Found ${posts.length} posts.\n`);
        for (let post of posts) {
            await displayPost(post);
        }
    } catch (error) {
        console.error('Error reading posts:', error.message);
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
		} else if (input.startsWith('read-posts')){
			const username = input.split(' ')[1];
			readPosts(username)
			  .then(() => resolve())
			  .catch((error) => reject(error));
		} else if (input.startsWith('clear ')){
			const database = input.split(' ')[1];
			deleteTable(database)
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

// Update only if it exists
// Profile.id is null (await)