const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const { WebClient } = require('@slack/client');

const port = process.env.PORT || 8080;
const dbUrl = process.env.SLACKRONYM_DB_URL;
const dbName = process.env.SLACKRONYM_DB_NAME;
const token = process.env.SLACKRONYM_TOKEN;

const app = express();
const web = new WebClient(token);

app.use(bodyParser.urlencoded({ extended: true }));

MongoClient.connect(dbUrl, (err, database) => {
    if (err) return console.log(err);
                      
    db = database.db(dbName);

    require('./app/routes')(app, db, web);

    app.listen(port, () => {
	console.log('We are live on ' + port);
    });
})
