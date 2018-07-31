module.exports = function(app, db) {
    app.post('/lookup', (req, res) => {
	console.log(req.body.text)
	key = req.body.text.toUpperCase()
	const details = {acronym: key}
	db.collection('definitions').findOne(details, (err, item) => {
	    if (err) {
		res.send({error: err});
	    }
	    else if (item){
		res.send(item);
	    }
	    else {
		res.send('something clever');
	    }
	});
    });

    app.post('/add', (req, res) => {
    	definition = {
    	    acronym: req.body.acronym.toUpperCase(),
    	    definition: req.body.definition
    	};
    	db.collection('definitions').insert(definition, (err, result) => {
    	    if (err) {
    		res.send({ 'error': 'Uh.. an error happened' });
    	    }
    	    else {
    		res.send(result.ops[0]);
    	    }
    	});
    });
};

