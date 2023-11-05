# Bluesky News Credibility Checker

This project is designed to determine the credibility of news posts on Bluesky by analyzing the content in real-time and checking the news rating from NewsGuard. It uses a Node.js server to monitor Bluesky posts and a Python script to check the credibility of links found in the posts.

## Table of Contents
- [Introduction](#introduction)
- [Setup](#setup)
- [Usage](#usage)
- [Dependencies](#dependencies)
- [License](#license)

## Introduction

Bluesky is a social media platform where users can share posts, including news articles. The credibility of news sources and the accuracy of news content are essential factors in assessing the quality of information shared on the platform. This project helps users identify the credibility of news articles shared on Bluesky by:

1. Monitoring Bluesky posts in real-time.
2. Extracting URLs from the posts.
3. Checking the credibility of the URLs using NewsGuard's rating.
4. Storing and displaying statistics on the credibility of news articles.

## Setup

To set up and run this project, follow these steps:

1. Clone this repository to your local machine.

2. Install the required Node.js packages by running the following command in the project directory:

   ```bash
   npm install
3. Set up a MySQL database with the name bluesky_db. Make sure to configure the database connection settings in the server.js file.

4. Create a .env file in the project directory and add your Bluesky username and password as environment variables:
   ```bash
    BLUESKY_USERNAME=your_username
    BLUESKY_PASSWORD=your_password
6. Start the Node.js server by running:
   ```bash
   node server.js

## Usage
To start monitoring Bluesky posts and checking the credibility of news articles, run the following command in the server's console: 
   ```bash
   firesky
   ```
To stop the server, enter the following command in the server's console: 
   ```bash
   stop
   ```

## Dependencies
- MySQL
- Node.js
- Express.js
- @atproto/api
- @atproto/xrpc-server
= @atproto/repo
- node-fetch
- dotenv

## License
This project is licensed under the MIT License. You are free to use and modify the code as needed.
