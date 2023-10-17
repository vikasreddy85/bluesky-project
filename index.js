const express = require('express')
const mysql = require('mysql')
const pkg = require('@atproto/api');
const BskyAgent = pkg.BskyAgent;
require("dotenv").config()

// #!/usr/bin/env node
// const yargs = require('yargs');
// const { hideBin } = require('yargs/helpers');
// const chalk = require('chalk');
// const ProgressBar = require('progress');
// const humanizeDuration = require('humanize-duration');

// //Database Imports
// const { Op } = require('sequelize');
// const database = require('./database.js');
// const Profile = database.Profile;
// const Post = database.Post;
// global.fetch = fetch;

// Create connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'vikas',
  password: 'database',
  database: 'bluesky_db',
  port: 3306,
});
const app = express();

db.connect((err) => {
  if (err){
    console.error('Error connecting to MySQL:', err);
  }
  console.log('Connected to MySQL');
});

// Create DB
app.get('/createdb', (req, res) => {
  const sql = 'CREATE DATABASE IF NOT EXISTS bluesky_db';
  db.query(sql, (err, result) => {
    if (err) {
      throw err;
    }
    console.log('Database created or already exists:', result);
    res.send('Database created or already exists...');
  });
});

app.get('/createprofiletable', (request, res) => {
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
    if (err){
      throw err;
    }
    console.log(result);
    res.send('Profile table created...');
  })
})

app.get('/createposttable', (request, res) => {
  let profileTableSQL = `
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
  db.query(profileTableSQL, (err, result) => {
    if (err){
      throw err;
    }
    console.log(result);
    res.send('Post table created...');
  })
})

app.listen('3000', () =>{
  console.log("Server started on port 3000.")
})

// Check if environment variables are defined
if (!process.env.BLUESKY_USERNAME || !process.env.BLUESKY_PASSWORD) {
  console.error('Env variables are not defined!');
  process.exit(1);
}

const agent = new BskyAgent({ service: 'https://bsky.social' });

/* Database Tasks */
// Convert URI to URL
// Get a profile by DID
// Insert or update a profile to the database
// Insert or update all posts associated with the user

/* Database Commands */
// List Profiles
// Fetch a Profile
// Load all of the profile's posts
// Fetch all Profiles
