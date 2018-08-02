const express        = require('express');
const MongoClient    = require('mongodb').MongoClient;
const bodyParser     = require('body-parser');

const app            = express();

const port = process.env.SLACKRONYM_PORT || 8080;
const dbUrl = process.env.SLACKRONYM_DB_URL;
const dbName = process.env.SLACKRONYM_DB_NAME;

app.use(bodyParser.urlencoded({ extended: true }));

MongoClient.connect(dbUrl, (err, database) => {
    if (err) return console.log(err);
                      
    db = database.db(dbName);

    require('./app/routes')(app, db);

    app.listen(port, () => {
	console.log('We are live on ' + port);
    });
})
