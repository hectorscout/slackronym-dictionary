module.exports = function(app, db) {

    _getAvailableAcronyms = () => {
	return ['tacos', 'stuff']
    }

    app.post('/lookup', (req, res) => {
	key = req.body.text.toUpperCase()
	const details = {acronym: key}

        if (['LIST', 'HELP'].includes(key)) {
            content = 'Available Acronyms:'
            acronyms = _getAvailableAcronyms();
            acronyms.sort()
	    res.send({
		text: content,
		attachments: [{text: acronyms.join(', ')}]
	    });
	}

	db.collection('definitions').findOne(details, (err, item) => {
	    if (err) {
		res.send({error: err});
	    }
	    else if (item){
		res.send({
		    text: `${item.acronym}:`,
		    attachments: [{text: item.definition}]
		});
	    }
	    else {
		res.send({text: 'something clever'});
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

