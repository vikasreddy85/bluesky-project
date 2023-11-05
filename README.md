<!DOCTYPE html>
<html>
<head>
    <title>Bluesky News Credibility Checker</title>
</head>
<body>
    <h1>Bluesky News Credibility Checker</h1>

    <p>This project is designed to determine the credibility of news posts on Bluesky by analyzing the content in real-time and checking the news rating from NewsGuard. It uses a Node.js server to monitor Bluesky posts and a Python script to check the credibility of links found in the posts.</p>

    <h2>Table of Contents</h2>
    <ul>
        <li><a href="#introduction">Introduction</a></li>
        <li><a href="#setup">Setup</a></li>
        <li><a href="#usage">Usage</a></li>
        <li><a href="#dependencies">Dependencies</a></li>
        <li><a href="#license">License</a></li>
    </ul>

    <h2>Introduction</h2>

    <p>Bluesky is a social media platform where users can share posts, including news articles. The credibility of news sources and the accuracy of news content are essential factors in assessing the quality of information shared on the platform. This project helps users identify the credibility of news articles shared on Bluesky by:</p>

    <ol>
        <li>Monitoring Bluesky posts in real-time.</li>
        <li>Extracting URLs from the posts.</li>
        <li>Checking the credibility of the URLs using NewsGuard's rating.</li>
        <li>Storing and displaying statistics on the credibility of news articles.</li>
    </ol>

    <h2>Setup</h2>

    <p>To set up and run this project, follow these steps:</p>

    <ol>
        <li>Clone this repository to your local machine.</li>
        <li>Install the required Node.js packages by running the following command in the project directory:</li>
    </ol>

    ```bash
    npm install
    ```

    <ol start="3">
        <li>Set up a MySQL database with the name <code>bluesky_db</code>. Make sure to configure the database connection settings in the <code>server.js</code> file.</li>
        <li>Create a <code>.env</code> file in the project directory and add your Bluesky username and password as environment variables:</li>
    </ol>

    ```env
    BLUESKY_USERNAME=your_username
    BLUESKY_PASSWORD=your_password
    ```

    <ol start="5">
        <li>Start the Node.js server by running:</li>
    </ol>

    ```bash
    node server.js
    ```

    <ol start="6">
        <li>The server will be running on <code>http://localhost:3000</code>. You can access it through your web browser.</li>
    </ol>

    <h2>Usage</h2>

    <p>Visit the server's home page (<a href="http://localhost:3000">http://localhost:3000</a>) to set up the database and tables.</p>

    <p>To start monitoring Bluesky posts and checking the credibility of news articles, run the following command in the server's console:</p>

    ```bash
    firesky
    ```

    <p>The project will start monitoring Bluesky posts and analyzing the URLs in real-time.</p>

    <p>To stop the server, enter the command <code>stop</code> in the console.</p>

    <h2>Dependencies</h2>

    <ul>
        <li>Node.js</li>
        <li>MySQL</li>
        <li>Express.js</li>
        <li>@atproto/api</li>
        <li>cbor</li>
        <li>node-fetch</li>
        <li>@atproto/xrpc-server</li>
        <li>@atproto/repo</li>
        <li>dotenv</li>
    </ul>

    <h2>License</h2>

    <p>This project is licensed under the <a href="LICENSE">MIT License</a>. You are free to use and modify the code as needed.</p>

    <hr>

    <p>Feel free to contribute to this project and help improve the credibility assessment of news articles on Bluesky. If you have any questions or need assistance, please don't hesitate to reach out to the project maintainers.</p>
</body>
</html>
