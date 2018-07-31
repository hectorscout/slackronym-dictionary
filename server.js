const express        = require('express');
const MongoClient    = require('mongodb').MongoClient;
const bodyParser     = require('body-parser');
// const dbConfig       = require('./config/db');

const app            = express();

const port = process.env.PORT || 8080;
const dbUrl = process.env.DB_URL;
    
app.use(bodyParser.urlencoded({ extended: true }));

MongoClient.connect(dbUrl, (err, database) => {
  if (err) return console.log(err)
                      
  // Make sure you add the database name and not the collection name
  db = database.db("slackronym-dictionary")
  require('./app/routes')(app, db);
  app.listen(port, () => {
    console.log('We are live on ' + port);
  });               
})
