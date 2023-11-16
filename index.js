const express = require("express");
const mysql = require("mysql");
const pkg = require("@atproto/api");
const cbor = require('cbor');
const { spawn } = require('child_process');
const BskyAgent = pkg.BskyAgent;
const extractUrls = require("extract-urls");
const { Subscription } = require('@atproto/xrpc-server');
const { cborToLexRecord, readCar } = require('@atproto/repo');
const agent = new BskyAgent({ service: "https://bsky.social"});
const app = express();
const fetch = require("node-fetch");
const subscription = new Subscription({
    service: `wss://bsky.network`,
    method: `com.atproto.sync.subscribeRepos`,
    getState: () => ({}),
    validate: (value) => value,
});
const pythonScript = './news_guard.py';
let below60Count = 0;
let above60Count = 0;
let totalMessages = 0;
let totalLinks = 0;
let intervalId;

require("dotenv").config();
app.set("views", "./pages");
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.static(__dirname + "/public"));
process.stdin.setEncoding("utf8");
global.fetch = fetch;

// Create connection
const db = mysql.createConnection({
	host: "localhost",
  	user: "vikas",
  	password: "password",
  	database: "bluesky_db",
  	port: 3306,
    charset: "utf8mb4"
});

db.connect((err) => {
  	if (err) {
		console.error("Error connecting to MySQL:", err);
  	}
});

// Check if environment variables are defined
if (!process.env.BLUESKY_USERNAME || !process.env.BLUESKY_PASSWORD) {
	console.error("Env variables are not defined!");
	process.exit(1);
}

app.listen("3000", () => {});

app.get("/", async (request, response) => {
    try {
        // Create or check the existence of the database
        const createDatabaseSQL = "CREATE DATABASE IF NOT EXISTS bluesky_db";
        await queryPromise(createDatabaseSQL, "Database created or already exists...");

        // Create the bsky_news table
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS bsky_news (
                Day DATE,
                TotalMessages INT,
                MessagesLessThan60 INT,
                MessagesGreaterThan60 INT
            )
        `;
        await queryPromise(createTableSQL, "bsky_news table created...");
        response.send("Database and table setup completed.");
    } catch (err) {
        console.error(err);
        response.status(500).send("Error occurred during database setup.");
    }
});

// Define a function to promisify the database query
function queryPromise(sql, successMessage) {
    return new Promise((resolve, reject) => {
        db.query(sql, (err, result) => {
            if (err) {
                reject(err);
            } else {
                console.log(successMessage);
                resolve(result);
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

function readInput() {
	return new Promise((resolve, reject) => {
	  process.stdout.write('Enter a command: ');
	  process.stdin.once('data', (input) => {
		input = input.trim();
		if (input === 'stop') {
		  console.log('Shutting down the server');
		  process.exit(0);
		} else if (input == 'firesky'){
			eventHandler();
        } else {
		  console.log(`Invalid command: ${input}`);
		  resolve();
		}
	  });
	});
}

const openFirehose = async (cborData) => {
    try {
        // Extract and log URLs from the post
        const car = await readCar(Uint8Array.from(cborData.blocks));
        const processedURLs = new Set();
    
        for (const operation of cborData.ops) {
            if (operation.action !== 'create') {
                continue;
            }
    
            const recordBytes = car.blocks.get(operation.cid);
            if (!recordBytes) {
                continue;
            }
    
            const lexRecord = cborToLexRecord(recordBytes);
            const collection = operation.path.split('/')[0];
            if (collection !== "app.bsky.feed.post") {
                continue;
            }
            if (lexRecord.text !== undefined && collection == "app.bsky.feed.post"){
                totalMessages++;
            }
    
            if (lexRecord.text !== undefined && lexRecord.text.toLowerCase().includes("https://")) {
                const urls = extractUrls(lexRecord.text);
    
                if (urls === undefined || !Array.isArray(urls)) {
                    continue;
                }
    
                for (const shortURL of urls) {
                    if (!processedURLs.has(shortURL)) {
                        processedURLs.add(shortURL);
                        totalLinks++;
                        const pythonProcess = spawn('python', [pythonScript, shortURL]);
    
                        pythonProcess.stdout.on('data', (data) => {
                            const score = data.toString().trim();
                            if (score !== "Score not found for URL:") {
                                console.log(`Score for URL ${shortURL}: ${score}`);
                                if (!isNaN(score)){
                                    if (score < 60) {
                                        below60Count++;
                                    } else {
                                        above60Count++;
                                    }
                                }
                            }
                        });
    
                        pythonProcess.stderr.on('data', (data) => {
                            console.error(data.toString());
                        });
    
                        pythonProcess.on('close', (code) => {
                            if (code !== 0) {
                                console.error(`Python process for URL ${shortURL} exited with code ${code}.`);
                            }
                        });
                    }
                }
            }
        }
    } catch (error) {
        // console.error(`Error: ${error.message}`);
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

const eventHandler = async () => {
    const insertDataIntoDatabase = async () => {
        const date = new Date();
        const currentDate = date.toISOString().split('T')[0] + ' ' + date.toISOString().split('T')[1].split('.')[0];
        try {
            const createDatabaseQuery = `
            INSERT INTO bsky_news (Day, TotalMessages, TotalLinks, NewsGreaterThan60, NewsLessThan60)
            VALUES (
              '${currentDate}', 
              ${totalMessages}, 
              ${totalLinks}, 
              ${above60Count}, 
              ${below60Count}
            );
          `;
            await queryPromise(createDatabaseQuery, "Data inserted into the database successfully.");
        } catch (err) {
            console.error('Error inserting data into the database:', err);
        }

        below60Count = 0;
        above60Count = 0;
        totalLinks = 0;
        totalMessages = 0;
    };

    // Clear the previous interval and set a new one
    clearInterval(intervalId);
    intervalId = setInterval(insertDataIntoDatabase, 3600000);
    
    try {
        for await (const event of subscription) {
            openFirehose(event);
        }
    } catch (error) {
        // console.error(`Error in eventHandler: ${error.message}`);
    }
};