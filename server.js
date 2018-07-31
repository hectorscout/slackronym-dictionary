const express        = require('express');
const MongoClient    = require('mongodb').MongoClient;
const bodyParser     = require('body-parser');
const dbConfig             = require('./config/db');

const app            = express();

const port = 8888;
    
app.use(bodyParser.urlencoded({ extended: true }));
//app.use(bodyParser.json());


// MongoClient.connect(db.url, (err, database) => {
//     if (err) return console.log(err)
    
//     db = database.db("slackronym-dictionary")
//     require('./app/routes')(app, db);
    
//     app.listen(port, () => {
// 	console.log('We are live on ' + port);
//     });
// });    

MongoClient.connect(dbConfig.url, (err, database) => {
  if (err) return console.log(err)
                      
  // Make sure you add the database name and not the collection name
  db = database.db("slackronym-dictionary")
  require('./app/routes')(app, db);
  app.listen(port, () => {
    console.log('We are live on ' + port);
  });               
})
