const express = require("express");
const mysql = require("mysql");
const pkg = require("@atproto/api");
const chalk = require('chalk');
const WebSocket = require('ws');
const cbor = require('cbor');
const BskyAgent = pkg.BskyAgent;
const app = express();
const verbose = false;

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
	host: "127.0.0.1",
  	user: "vikas",
  	password: "database",
  	database: "bluesky_db",
  	port: 3306,
    charset: "utf8mb4"
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
async function retrieveProfileUsingDID(did) {
    return new Promise((resolve, reject) => {
        const profileQuery = 'SELECT * FROM profiles WHERE did = ? LIMIT 1';
        db.query(profileQuery, [did], (err, result) => {
            if (err) {
                reject(err);
            } else {
                // Check if any profile was found
                if (result && result.length > 0) {
                    resolve(result[0]);
                } else {
                    resolve(null); // Return null if no profile was found
                }
            }
        });
    });
}

async function deleteIncorrectRows() {
    try {
        // Identify profile IDs that meet the criteria
        const selectProfilesQuery = 'SELECT id FROM profiles WHERE followers_count = 0 and follows_count = 0 and posts_count = 0';

        const profiles = await new Promise((resolve, reject) => {
            db.query(selectProfilesQuery, (err, result) => {
                if (err) {
                    console.error('Error selecting profiles:', err);
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });

        // Extract profile IDs from the result
        const profileIds = profiles.map(profile => profile.id);

        if (profileIds.length === 0) {
            // No profiles meet the criteria, nothing to delete
            return {
                postsDeleted: 0,
                profilesDeleted: 0,
            };
        } else {
            // Delete related posts
            const deletePostsQuery = 'DELETE FROM posts WHERE profile_id IN (?)';

            const postsResult = await new Promise((resolve, reject) => {
                db.query(deletePostsQuery, [profileIds], (err, result) => {
                    if (err) {
                        console.error('Error deleting posts:', err);
                        reject(err);
                    } else {
                        console.log('Deleted posts:', result.affectedRows);
                        resolve(result);
                    }
                });
            });

            // Once related 'posts' rows are deleted, delete the corresponding 'profiles' rows
            const deleteProfilesQuery = 'DELETE FROM profiles WHERE id IN (?)';

            const profilesResult = await new Promise((resolve, reject) => {
                db.query(deleteProfilesQuery, [profileIds], (err, result) => {
                    if (err) {
                        console.error('Error deleting profiles:', err);
                        reject(err);
                    } else {
                        console.log('Deleted profiles:', result.affectedRows);
                        resolve(result);
                    }
                });
            });

            return {
                postsDeleted: postsResult.affectedRows,
                profilesDeleted: profilesResult.affectedRows,
            };
        }
    } catch (error) {
        // Handle any errors that occur during the process
        console.error('Error:', error);
        throw error;
    }
}

async function deletePosts(profileIds) {
    const deletePostsQuery = 'DELETE FROM posts WHERE profile_id IN (?)';
    const postsResult = await new Promise((resolve, reject) => {
        db.query(deletePostsQuery, [profileIds], (err, result) => {
            if (err) {
                console.error('Error deleting posts:', err);
                reject(err);
            } else {
                console.log('Deleted posts:', result.affectedRows);
                resolve(result.affectedRows);
            }
        });
    });
    return postsResult;
}

async function deleteProfiles(profileIds) {
    const deleteProfilesQuery = 'DELETE FROM profiles WHERE id IN (?)';
    const profilesResult = await new Promise((resolve, reject) => {
        db.query(deleteProfilesQuery, [profileIds], (err, result) => {
            if (err) {
                console.error('Error deleting profiles:', err);
                reject(err);
            } else {
                console.log('Deleted profiles:', result.affectedRows);
                resolve(result.affectedRows);
            }
        });
    });
    return profilesResult;
}

function splitIntoBatches(arr, batchSize) {
    const batches = [];
    for (let i = 0; i < arr.length; i += batchSize) {
        batches.push(arr.slice(i, i + batchSize));
    }
    return batches;
}

async function getPostByUri(uri) {
    return new Promise((resolve, reject) => {
        const postQuery = 'SELECT * FROM posts WHERE uri = ? LIMIT 1';
        db.query(postQuery, [uri], (err, result) => {
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
		let profileVar = profile.did === undefined? profile.author.did : profile.did
        db.query(deletePostsQuery, [profileVar], (err, result) => {
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
        await deletePosts();
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
    const today = new Date();
    const formattedIndexedAt = today.toISOString().slice(0, 19).replace('T', ' ');

    // Check if the profile with the provided DID already exists
    const existingProfile = await retrieveProfileUsingDID(profileData.did);
    if (!existingProfile) {
        // Create a new profile
        try {
            if (profileData.description && profileData.description.length > 255) {
                profileData.description = profileData.description.slice(0, 252) + '...';
            }

            const newProfile = {
                did: profileData.did,
                handle: profileData.handle || '',
                display_name: profileData.displayName || '',
                description: profileData.description || '',
                follows_count: profileData.followsCount || 0,
                followers_count: profileData.followersCount || 0,
                posts_count: profileData.postsCount || 0,
                indexed_at: formattedIndexedAt
            };

            const insertQuery = 'INSERT INTO profiles SET ?';
            await new Promise((resolve, reject) => {
                db.query(insertQuery, newProfile, (err, result) => {
                    if (err) {
                        console.error(`Error creating profile for ${profileData.handle}: ${err.message}`);
                        reject(err);
                    } else {
                        resolve(newProfile);
                    }
                });
            });
            return newProfile;
        } catch (error) {
            console.error(`Error creating profile with DID: ${profileData.did}.`);
            throw error;
        }
    } else {
        // Update the existing profile
        try {
            let updateProfile = 'UPDATE profiles SET ';
            let params = [];
            let paramValues = [];

            if (profileData.handle !== undefined) {
                params.push('handle = ?');
                paramValues.push(profileData.handle || '');
            }

            if (profileData.displayName !== undefined) {
                params.push('display_name = ?');
                paramValues.push(profileData.displayName || '');
            }

            if (profileData.description !== undefined) {
                params.push('description = ?');
                if (profileData.description.length > 255) {
                    profileData.description = profileData.description.slice(0, 252) + '...';
                }
                paramValues.push(profileData.description || '');
            }

            if (profileData.followsCount !== undefined && profileData.followsCount >= 0) {
                params.push('follows_count = ?');
                paramValues.push(profileData.followsCount);
            }

            if (profileData.followersCount !== undefined && profileData.followersCount >= 0) {
                params.push('followers_count = ?');
                paramValues.push(profileData.followersCount);
            }

            if (profileData.postsCount !== undefined && profileData.postsCount >= 0) {
                params.push('posts_count = ?');
                paramValues.push(profileData.postsCount);
            }

            params.push('indexed_at = ?');
            paramValues.push(formattedIndexedAt);
            updateProfile += params.join(', ');
            updateProfile += ' WHERE did = ?';
            paramValues.push(profileData.did);

            await new Promise((resolve, reject) => {
                db.query(updateProfile, paramValues, (err, result) => {
                    if (err) {
                        console.error(`Error updating profile for ${profileData.handle}: ${err.message}`);
                        reject(err);
                    } else {
                        resolve({ ...profileData, indexed_at: formattedIndexedAt });
                    }
                });
            });

            return { ...profileData, indexed_at: formattedIndexedAt };
        } catch (error) {
            console.error(`Error updating profile with DID: ${profileData.did}.`);
            throw error;
        }
    }
}

// Insert or update all posts associated with the user
async function insertOrUpdatePost(verboseOutput, postData) {
    let posts;
    const postAuth = await getPostByUri(postData.uri);
    const today = new Date();
    const formattedIndexedAt = today.toISOString().slice(0, 19).replace('T', ' ');
    const formattedCreatedAt = postData.record.createdAt.slice(0, 19).replace('T', ' ');

    if (!postAuth) {
        // Get author profile
        let profile = await insertOrUpdateProfile({
            did: postData.author.did,
            handle: postData.author.handle,
            displayName: postData.author.displayName,
            indexedAt: formattedIndexedAt
        });
		
        try {
            let profileRetID = await getProfileRetID(profile);
			if (postData.record.text && postData.record.text.length > 255) {
				postData.record.text = postData.record.text.slice(0, 252) + '...';
			}
            
            let post = {
                profile_id: profileRetID,
                uri: postData.uri || '',
                cid: postData.cid || '',
                text: postData.record.text || '',
                created_at: formattedCreatedAt,
                reply_count: postData.replyCount || 0,
                repost_count: postData.repostCount || 0,
                like_count: postData.likeCount || 0,
                indexed_at: formattedIndexedAt,
                url: await urlFromUri(postData.author.handle, postData.uri) || ''
            };
            
            // Try to insert the post; if it fails due to duplicate URI, update the existing post.
            let sql = 'INSERT INTO posts SET ? ON DUPLICATE KEY UPDATE uri=VALUES(uri)';
            posts = await new Promise((resolve, reject) => {
                db.query(sql, post, (err, result) => {
                    if (err) {
                        console.error(`Error updating or creating post for ${postData.uri}: ${err.message}`);
                        reject(err);
                    } else {
                        resolve({...post});
                    }
                });
            });
        } catch (error) {
            console.error(`Error creating or updating post with URI: ${postData.uri}: ${error.message}`);
            throw error;
        }
    } else {
        // Post exists, update it
        try {
            let updatePost = 'UPDATE posts SET ';
            let paramValues = [];
            
            if (postData.replyCount !== undefined) {
                updatePost += ' reply_count = ?,';
                paramValues.push(postData.replyCount || 0);
            }
            
            if (postData.repostCount !== undefined) {
                updatePost += ' repost_count = ?,';
                paramValues.push(postData.repostCount || 0);
            }
            
            if (postData.likeCount !== undefined) {
                updatePost += ' like_count = ?,';
                paramValues.push(postData.likeCount || 0);
            }
            if (postData.record.text !== undefined) {
                updatePost += ' text = ?,';
                if (postData.record.text && postData.record.text.length > 255) {
                    postData.record.text = postData.record.text.slice(0, 252) + '...';
                }
                paramValues.push(postData.record.text || '');
            }
            updatePost += ' indexed_at = ? WHERE uri = ?';
            paramValues.push(formattedIndexedAt, postData.uri);
            await new Promise((resolve, reject) => {
                db.query(updatePost, paramValues, (err, result) => {
                    if (err) {
                        console.error(`Error updating post with URI: ${postData.uri}: ${err.message}`);
                        reject(err);
                    } else {
                        posts = { ...postData, indexed_at: formattedIndexedAt };
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.error(`Error updating post with URI: ${postData.uri}: ${error.message}`);
            throw error;
        }
    }
    return posts;
}

// Fetch Profile Information and Post Information
async function fetchProfile(argv) {
    let profileData = null;

    // Load the profile from the API
    try {
        const returnValue = await agent.getProfile({ actor: argv });
        profileData = returnValue.data;
    } catch (error) {
		if (error.response && error.response.status === 429) {
			console.log(`Rate limit exceeded. Waiting for rate limit reset...`);
			process.exit(0);
		}else{
			console.error(`Error: Failed to fetch user ${argv}`);
			throw error;
		}
    }

    // Load all of the profile's posts
    let profile = await insertOrUpdateProfile(profileData);
    let postsCnt = profileData.postsCount;
    let posts = [];
    let cursor = null;
    let counter = 0;
    
    while (counter < postsCnt && true) {
        try {
            // Make the API request
            let params = { actor: profile.handle, limit: 100 }
            if (cursor) {
                params.cursor = cursor;
            }
            const returnValue = await agent.getAuthorFeed(params);
            // Check if the response contains text data
            posts = returnValue.data.feed;
            cursor = returnValue.data.cursor;
            counter += 1;
            
            if (!cursor) {
                break;
            }
        } catch (error) {
			if (error.response && error.response.status === 429) {
				console.log(`Rate limit exceeded. Waiting for rate limit reset...`);
				process.exit(0);
			}else{
				console.error(`Error: Failed to fetch user ${argv}`);
				throw error;
			}
        }
        
        // Add the posts to the database
        for (let postData of posts) {
            await insertOrUpdatePost(verbose, postData.post);
        }
    }

    // Rest of your code for handling followers and following posts
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
		} else if (input == 'firesky'){
			openFirehose('wss://bsky.social', console.log);
		} else if (input == 'fix'){
			deleteIncorrectRows();
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
        console.error(`Error: Failed to login. Please check your BLUESKY_USERNAME and BLUESKY_PASSWORD.`);
		throw(error);
    }
	startServer();
})();

async function openFirehose(service = 'wss://bsky.social', onMessage) {
    const runTime = 30 * 1000; // 35 seconds
    const pauseTime = 5 * 60 * 1000; // 5 minutes

    let ws;
    let running = false;

    async function start() {
        if (running) {
            console.log("Already running. Skipping this run.");
            return;
        }

        ws = new WebSocket(`${service}/xrpc/com.atproto.sync.subscribeRepos`);
        ws.binaryType = 'arraybuffer';

        ws.addEventListener('message', async ({ data }) => {
            if (!running) {
                return; // Stop processing messages if not running
            }

            try {
                // Process the message here
                const uint8Data = new Uint8Array(Buffer.from(data, 'base64'));
                const cborData = cbor.decodeAllSync(uint8Data);
                if (cborData[1].repo) {
                    await fetchProfile(cborData[1].repo);
                }
            } catch (error) {
                console.error(`Error: ${error.message}`);
            }
        });

        ws.addEventListener('close', () => {
            if (running) {
                console.log('WebSocket connection closed. Attempting to reconnect...');
                setTimeout(() => {
                    start();
                }, pauseTime);
            }
        });

        running = true;

        setTimeout(() => {
            running = false; // Stop running after the runTime
            ws.close();
            setTimeout(start, pauseTime);
        }, runTime);
    }

    // Start the initial run
    await start();
}