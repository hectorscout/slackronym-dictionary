module.exports = function(app, db) {

    _getAvailableAcronyms = () => {
	return ['tacos', 'stuff']
    }


    _getListResponse = () => {
        acronyms = _getAvailableAcronyms();
        acronyms.sort()
	return {
	    text: 'Available Acronyms:',
	    attachments: [{text: acronyms.join(', ')}]
	};
    }


    _getAdditionResponse = (text) => {
	[key, definition] = text.split(':');
	key = key.toUpperCase();
	console.log(key);
	console.log(definition);
	return {
	    text: `Looks like you want to add \`${key}\` as \`${definition}\`?`,
	    attachments: [{
		text: 'idk',
		actions:
		[{
		    name: 'request',
		    text: 'We should add it.',
		    type: 'button',
		    value: JSON.stringify({key: key, definition: definition})
		}, {
		    name: 'dumb',
		    text: 'I was just being dumb.',
		    type: 'button',
		    value: 'dumb'
		}]
	    }]
	}
    }


    _getUnknownResponse = (text) => {
	return {
	    text: `We're not sure what \`${text}\` is...`,
	    attachments: [{
		text: 'idk',
		callback_id: 'unknown',
		actions:
		[{
		    name: 'request',
		    text: 'We should add it.',
		    type: 'button',
		    value: text
		}, {
		    name: 'dumb',
		    text: 'I was just being dumb.',
		    type: 'button',
		    value: 'dumb'
		}]
	    }]
	};
    }

    
    app.post('/request', (req, res) => {
	console.log(req.body)
	
    });

    app.post('/lookup', (req, res) => {
	key = req.body.text.toUpperCase()

	// if (req.body.text.indexOf(':') != -1){
	//     res.send(_getAdditionResponse(req.body.text));
	// }
	if (['LIST', 'HELP'].includes(key)) {
	    res.send(_getListResponse());
	}
	else {
	    db.collection('definitions').findOne({acronym: key}, (err, item) => {
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
		    res.send(_getUnknownResponse(req.body.text));
		}
	    });
	}
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

