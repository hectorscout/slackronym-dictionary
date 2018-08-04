module.exports = function(app, db, web) {
    const token = process.env.SLACKRONYM_TOKEN;
    const notificationChannel = process.env.SLACKRONYM_NOTIFICATION_CHANNEL;
    const request = require('request');

    const ADD_ACK_ID = 'addAck';
    const DEFINE_ACK_DIALOG_ID = 'defineAckDialog';
    const DUMB_VALUE = 'A very dumb thing that noone will type into the thing';
    const MESSAGE_LOOKUP_ID = 'messageLookUp';
    
    let messageIds = {};


    _getItemAttachment = (item, {update, includeUser} = {}) => {
	itemAttachment = {
	    title: `${item.acronym}:`,
	    text: item.definition,
	    fields: []
	}
	if (item.docUrl) {
	    itemAttachment.fields.push({
		title: 'Documentation',
		value: item.docUrl,
		short: false
	    });
	}
	if (includeUser) {
	    itemAttachment.fields.push({
		title: 'Added By',
		value: item.username,
		short: true
	    });
	}
	if (update) {
	    itemAttachment.callback_id = ADD_ACK_ID;
	    itemAttachment.actions = [{
		name: 'request',
		text: 'Update',
		type: 'button',
		value: key
	    }];
	}
	
	return itemAttachment;
    }
    

    _getListResponse = (callback) => {
	db.collection('definitions').distinct('acronym', (err, acronyms) => {
	    if (err) {
		callback({text: 'There was an error trying to get all the available acronyms. Please try again later.'});
	    }
	    else {
		acronyms.sort()
		callback({
		    text: 'Available Acronyms:',
		    attachments: [{text: acronyms.join(', ')}]
		});
	    }
	});
    };


    _getUnknownResponse = (text) => {
	return {
	    text: `We're not sure what \`${text}\` is...`,
	    attachments: [{
		callback_id: ADD_ACK_ID,
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
		    value: DUMB_VALUE
		}]
	    }]
	};
    }


    _getDefinitionsItem = (acronym, callback) => {
	const cursor = db.collection('definitions').find({acronym: acronym}).sort({timestamp: -1}).limit(1);
	cursor.count((err, count) => {
	    if (err) callback(err);
	    if (!count) {
		return callback(null, {acronym: acronym});
	    }
	});
	cursor.each((err, item) => {
	    if (err) return callback(err);
	    else if (item) return callback(null, item);
	});
	
    }
    

    _openAddDialog = (triggerId, options) => {
	_getDefinitionsItem(options.acronym, (err, item) => {
	    if (err) {
		return console.log('There was an error trying to get a definition:', {error: err});
	    }
	    web.dialog.open({
		trigger_id: triggerId,
		dialog: {
		    callback_id: DEFINE_ACK_DIALOG_ID,
		    title: 'AAA (Add An Acronym)',
		    submit_label: 'Add',
		    notify_on_cancel: true,
		    elements: [
			{
			    type: 'text',
			    label: 'Acronym',
			    name: 'acronym',
			    value: options.acronym
			},
			{
			    type: 'text',
			    label: 'Definition',
			    name: 'definition',
			    optional: true,
			    hint: "If you don't know, just leave it blank and we'll try to figure it out.",
			    value: item.definition
			},
			{
			    type: 'text',
			    label: 'Documentation Link',
			    name: 'docUrl',
			    optional: true,
			    subType: 'url',
			    value: item.docUrl,
			    hint: "FYI: If this is dumb, we'll just remove it... (and ban you ¯\\_(ツ)_/¯)"
			}
		    ]
		}
	    });
	});
    }


    _updateDefinition = ({acronym, definition, docUrl, username}, callback) => {
    	definition = {
    	    acronym: acronym.toUpperCase(),
    	    definition: definition,
	    docUrl: docUrl,
	    username: username,
	    timestamp: new Date().toISOString()
    	};
    	db.collection('definitions').insert(definition, callback);
    }


    _updateMessage = (userId, message) => {
	options = {
	    url: messageIds[userId],
	    headers: {
                Authorization: `Bearer ${token}`,
                'Content-type': 'application/json'
	    },
	    body: JSON.stringify(message)
	};
	request.post(options, (err, response, body) => {
	    console.log('err', err);
	    console.log('response', response);
	    console.log('body', body);
	});
    }
    

    _updateCallback = (err, result, res, userId) => {
	if (err) {
	    res.send('There was... a _problem_...');
	}
	else {
	    item = result.ops[0];
	    let confirmationMessage = {
		text: `We successfully updated the dictionary with your definition of \`${item.acronym}\`.`,
		attachments: [_getItemAttachment(item)]
	    };
	    _updateMessage(userId, confirmationMessage);
	    res.send();

	    let notificationMessage = {
		text: 'Somebody added this...',
		channel: notificationChannel,
		attachments: [_getItemAttachment(item, {includeUser: true})]
	    };
	    web.chat.postMessage(notificationMessage);
	}
    }


    _postMessageLookup = ({channel, user, message}) => {
	const words = message.replace(/[^\w\s]/g,'').split(' ').map(x => x.toUpperCase());
	let cursor = db.collection('definitions').aggregate([
	    {$match: {acronym: {$in: words}}},
	    {$sort: {timestamp: -1}},
	    {$group: {
	    	_id: '$acronym',
	    	acronym: {$first: '$acronym'},
	    	definition: {$first: '$definition'},
	    	docUrl: {$first: '$docUrl'}
	    }}
	]);
	cursor.toArray((err, items) => {
	    let attachments = [];
	    let text = 'No acronyms we know about in that message.'
	    if (items) {
		attachments = items.map(_getItemAttachment);
		text = '';
	    }
	    web.chat.postEphemeral({
		text: text,
		channel: payload.channel.id,
		user: payload.user.id,
		attachments: attachments
	    });
	});
    }
    
    
    // Commands from interactive stuff like buttons and dialogs
    app.post('/request', (req, res) => {
	payload = JSON.parse(req.body.payload);
	console.log('/request');
	console.log('payload', payload);
	
	switch (payload.callback_id) {
	case ADD_ACK_ID:
            // Clicked a `We should add it`, `I was just being dumb`, or `Update` button
	    console.log(payload.actions[0]);
	    value = payload.actions[0].value;
	    if (value === DUMB_VALUE) return res.send({text: 'https://media1.giphy.com/media/l0ExsczAepXFxWSw8/200.gif'});
	    messageIds[payload.user.id] = payload.response_url;
	    _openAddDialog(payload.trigger_id, {acronym: value});
	    res.send({text: 'Defining an acronym (_like a boss_)'});
	    break;
	case DEFINE_ACK_DIALOG_ID:
	    // Closed the add definitions dialog
	    if (payload.type === 'dialog_cancellation') {
		_updateMessage(payload.user.id, {text: 'You did the right thing.'});
	    }
	    else {
		_updateDefinition({
		    acronym: payload.submission.acronym,
		    definition: payload.submission.definition,
		    docUrl: payload.submission.docUrl,
		    username: payload.user.name
		}, (err, result) => _updateCallback(err, result, res, payload.user.id));
	    }
	    res.send();
	    break;
	case MESSAGE_LOOKUP_ID:
	    // Look up acronyms in a message
	    _postMessageLookup({
		channel: payload.channel.id,
		user: payload.user.id,
		message: payload.message.text
	    });
	    res.send();
	}
    });

    // Main commands
    app.post('/lookup', (req, res) => {
	console.log('/lookup');
	console.log('request body', req.body);

	key = req.body.text.toUpperCase()
	const update = key.split(' ')[0] === 'UPDATE'
	if (update) {
	    key = key.split(' ')[1] || '';
	}

	if (['LIST', 'HELP'].includes(key)) {
	    return _getListResponse((response) => res.send(response));
	    // return res.send(_getListResponse());
	}

	_getDefinitionsItem(key, (err, item) => {
	    if (err) {
		console.log('err:', err);
		res.send({error: err});
	    }
	    else if (!item.definition) {
		res.send(_getUnknownResponse(req.body.text));
	    }
	    else {
		res.send({text: '', attachments: [_getItemAttachment(item, {update: update})]});
	    }
	});
    });

    app.get('/populate', (req, res) => {
	const definitions = [
	    {
		'acronym': 'RMS',
		'definitions': 'Risk Management Solutions'
	    },
	    {
		'acronym': 'AAL',
		'definitions': 'Average Annual Loss (Pure Premium)'
	    },
	    {
		'acronym': 'ABI',
		'definitions': 'Association of British Insurers'
	    },
	    {
		'acronym': 'ACV',
		'definitions': 'Actual Cash Value'
	    },
	    {
		'acronym': 'AEP',
		'definitions': 'Annual Exceedence Probability, Aggregate Exceedence Probability, Annual Probability of Exceedence'
	    },
	    {
		'acronym': 'AFM',
		'definitions': 'Account Fire Model'
	    },
	    {
		'acronym': 'AGR',
		'definitions': 'AGRicultural (in RiskLink)'
	    },
	    {
		'acronym': 'ALAE',
		'definitions': 'Allocated Loss Adjustment Expense'
	    },
	    {
		'acronym': 'ALE',
		'definitions': 'Additional Living Expenses'
	    },
	    {
		'acronym': 'ALR',
		'definitions': 'Annual Loss Ratio'
	    },
	    {
		'acronym': 'ALM',
		'definitions': 'Aggregate Loss Module'
	    },
	    {
		'acronym': 'AP',
		'definitions': 'Alquist-Priolo'
	    },
	    {
		'acronym': 'API',
		'definitions': 'Application Programming Interface'
	    },
	    {
		'acronym': 'AR',
		'definitions': 'Accounts Receivable'
	    },
	    {
		'acronym': 'ART',
		'definitions': 'Alternative Risk Transfer'
	    },
	    {
		'acronym': 'AS',
		'definitions': 'Analytical Services (RMS department)'
	    },
	    {
		'acronym': 'ASI',
		'definitions': 'Average Sums Insured'
	    },
	    {
		'acronym': 'ASTER',
		'definitions': 'Advanced Spaceborne Thermal Emission and Reflection'
	    },
	    {
		'acronym': 'ATC',
		'definitions': 'Applied Technology Council'
	    },
	    {
		'acronym': 'AU',
		'definitions': 'AUstralia'
	    },
	    {
		'acronym': 'BE',
		'definitions': 'Belgium'
	    },
	    {
		'acronym': 'BETI',
		'definitions': 'Billing, Expenses, Time & Invoices'
	    },
	    {
		'acronym': 'BI',
		'definitions': 'Business Interruption, Business Intelligence'
	    },
	    {
		'acronym': 'BLEVE',
		'definitions': 'Boiling Liquid Expanding Vapor Explosion'
	    },
	    {
		'acronym': 'BR',
		'definitions': 'Builder\'s Risk'
	    },
	    {
		'acronym': 'BVT',
		'definitions': 'Build Validation Test'
	    },
	    {
		'acronym': 'C4',
		'definitions': 'Risk Modeler Team (There are various competing stories about the origins of this team name)'
	    },
	    {
		'acronym': 'CA',
		'definitions': 'Canada, California'
	    },
	    {
		'acronym': 'CAR',
		'definitions': 'Construction All Risk'
	    },
	    {
		'acronym': 'CA DOI',
		'definitions': 'California Department of Insurance'
	    },
	    {
		'acronym': 'CAT',
		'definitions': 'CATastrophe, Catastrophe Analysis Training'
	    },
	    {
		'acronym': 'CB',
		'definitions': 'CariBbean'
	    },
	    {
		'acronym': 'CBD',
		'definitions': 'Central Business District'
	    },
	    {
		'acronym': 'CBLD',
		'definitions': 'Commercial, BuiLDing (in RiskLink)'
	    },
	    {
		'acronym': 'CBRN',
		'definitions': 'Chemical, Biological, Radiological, Nuclear'
	    },
	    {
		'acronym': 'CC',
		'definitions': 'Client Conference'
	    },
	    {
		'acronym': 'CCNT',
		'definitions': 'Commercial CoNTents (in RiskLink)'
	    },
	    {
		'acronym': 'CCRA',
		'definitions': 'Certified Catastrophe Risk Analyst'
	    },
	    {
		'acronym': 'CD',
		'definitions': 'Client Development (RMS department)'
	    },
	    {
		'acronym': 'CDA',
		'definitions': 'Confidential Disclosure Agreement'
	    },
	    {
		'acronym': 'CDF',
		'definitions': 'Cumulative Distribution Function'
	    },
	    {
		'acronym': 'CDL',
		'definitions': 'Contract Defnition Language'
	    },
	    {
		'acronym': 'CE',
		'definitions': 'Central Europe'
	    },
	    {
		'acronym': 'CEA',
		'definitions': 'California Earthquake Authority, China Earthquake Administration'
	    },
	    {
		'acronym': 'CEP',
		'definitions': 'Conditional Exceedance Probability'
	    },
	    {
		'acronym': 'CFD',
		'definitions': 'Computational Fluid Dynamics'
	    },
	    {
		'acronym': 'CIR',
		'definitions': 'Change Impact Report'
	    },
	    {
		'acronym': 'CL',
		'definitions': 'Client Loss, ChiLe'
	    },
	    {
		'acronym': 'CLT',
		'definitions': 'Contents Loss Trigger'
	    },
	    {
		'acronym': 'CM',
		'definitions': 'Characteristic Magnitude'
	    },
	    {
		'acronym': 'CO',
		'definitions': 'COlumbia, COlorado'
	    },
	    {
		'acronym': 'COC',
		'definitions': 'Course Of Construction'
	    },
	    {
		'acronym': 'COGS',
		'definitions': 'Cost Of Goods Sold'
	    },
	    {
		'acronym': 'COPS',
		'definitions': 'Cloud OPerationS (replaced by SRE)'
	    },
	    {
		'acronym': 'COM',
		'definitions': 'COMmercial (in RiskLink)'
	    },
	    {
		'acronym': 'COV',
		'definitions': 'COVariance'
	    },
	    {
		'acronym': 'CPCU',
		'definitions': 'Chartered Property Casualty Underwriter'
	    },
	    {
		'acronym': 'CRESTA',
		'definitions': 'Catastrophe Risk Evaluating and Standardizing Target Accumulations'
	    },
	    {
		'acronym': 'CRF',
		'definitions': 'Contract Request Form'
	    },
	    {
		'acronym': 'CRS',
		'definitions': 'Client Response System'
	    },
	    {
		'acronym': 'CV',
		'definitions': 'Coefficient of Variation'
	    },
	    {
		'acronym': 'D2C',
		'definitions': 'Distance to Coast (same as DTC)'
	    },
	    {
		'acronym': 'DE',
		'definitions': 'DEutschland (Germany), DElaware'
	    },
	    {
		'acronym': 'DFA',
		'definitions': 'Dynamic Financial Analysis'
	    },
	    {
		'acronym': 'DK',
		'definitions': 'DenmarK'
	    },
	    {
		'acronym': 'DLM',
		'definitions': 'Detailed Loss Module'
	    },
	    {
		'acronym': 'DMGI',
		'definitions': 'DMG Information (investment arm of the Daily Mail and General Trust)'
	    },
	    {
		'acronym': 'DNA',
		'definitions': 'Deployment Needs Assessment'
	    },
	    {
		'acronym': 'DOI',
		'definitions': 'Department Of Insurance'
	    },
	    {
		'acronym': 'DQT',
		'definitions': 'Data Quality Toolkit'
	    },
	    {
		'acronym': 'DSM',
		'definitions': 'Decision Support Module'
	    },
	    {
		'acronym': 'DSN',
		'definitions': 'Data Source Name'
	    },
	    {
		'acronym': 'DTC',
		'definitions': 'Distance To Coast (same as D2C)'
	    },
	    {
		'acronym': 'DTF',
		'definitions': 'Distance To Fault'
	    },
	    {
		'acronym': 'DTM',
		'definitions': 'Digital Terrain Model'
	    },
	    {
		'acronym': 'EA',
		'definitions': 'Environment Agency'
	    },
	    {
		'acronym': 'EAR',
		'definitions': 'Erection All Risks'
	    },
	    {
		'acronym': 'EDM',
		'definitions': 'Exposure Data Module'
	    },
	    {
		'acronym': 'EED',
		'definitions': 'Economic Exposure Database'
	    },
	    {
		'acronym': 'EEF',
		'definitions': 'Event Exceedance Frequency, Empirical Exceedance Frequency'
	    },
	    {
		'acronym': 'EFEI',
		'definitions': 'Earthquake Fire Expense Insurance'
	    },
	    {
		'acronym': 'EGC',
		'definitions': 'Enterprise Grid Computing (RiskLink environment configuration)'
	    },
	    {
		'acronym': 'ELT',
		'definitions': 'Event Loss Table'
	    },
	    {
		'acronym': 'EM',
		'definitions': 'Exposure Manager'
	    },
	    {
		'acronym': 'EML',
		'definitions': 'Expected Maximum Loss (same as PML)'
	    },
	    {
		'acronym': 'EP',
		'definitions': 'Exceedance Probability'
	    },
	    {
		'acronym': 'ERM',
		'definitions': 'Enterprise Risk Management'
	    },
	    {
		'acronym': 'ERRF',
		'definitions': 'Employee Requirements Request Form'
	    },
	    {
		'acronym': 'ETA',
		'definitions': 'Estimated Time of Arrival'
	    },
	    {
		'acronym': 'EQ',
		'definitions': 'EarthQuake'
	    },
	    {
		'acronym': 'EQSL',
		'definitions': 'EarthQuake Sprinkler Linkage'
	    },
	    {
		'acronym': 'FAC',
		'definitions': 'FACultative'
	    },
	    {
		'acronym': 'FCAS',
		'definitions': 'Fellow, Casualty Actuarial Society'
	    },
	    {
		'acronym': 'FCHLPM',
		'definitions': 'Florida Commission on Hurricane Loss Projection Meth'
	    },
	    {
		'acronym': 'GDPR',
		'definitions': 'Global Data Protection Regulation'
	    },
	    {
		'acronym': 'GDS',
		'definitions': 'Global Data Store'
	    },
	    {
		'acronym': 'GLM',
		'definitions': 'Global Location Module'
	    },
	    {
		'acronym': 'HD',
		'definitions': 'High Definition, Hot Dog'
	    },
	    {
		'acronym': 'HDA',
		'definitions': 'High Definition Analyzer'
	    },
	    {
		'acronym': 'HPC',
		'definitions': 'High Performance Computing ()'
	    },
	    {
		'acronym': 'IED',
		'definitions': 'Industry Exposure Data'
	    },
	    {
		'acronym': 'IFG',
		'definitions': 'Input File Generation'
	    },
	    {
		'acronym': 'IFM',
		'definitions': 'Industrial Facilities Module'
	    },
	    {
		'acronym': 'ILC',
		'definitions': 'Industry Loss Curve'
	    },
	    {
		'acronym': 'ILS',
		'definitions': 'Industry-Linked Securities'
	    },
	    {
		'acronym': 'IPG',
		'definitions': 'Industry Practice Group'
	    },
	    {
		'acronym': 'IT',
		'definitions': 'Italy, Information Technology'
	    },
	    {
		'acronym': 'ITV',
		'definitions': 'Insurance To Value'
	    },
	    {
		'acronym': 'JACE',
		'definitions': 'Just Another Catastrophe Engineer'
	    },
	    {
		'acronym': 'JP',
		'definitions': 'JaPan'
	    },
	    {
		'acronym': 'KI',
		'definitions': 'Known Issue'
	    },
	    {
		'acronym': 'KPI',
		'definitions': 'Key Performance Indicator'
	    },
	    {
		'acronym': 'LAG',
		'definitions': 'Latest And Greatest'
	    },
	    {
		'acronym': 'LAE',
		'definitions': 'Loss Adjustment Expense'
	    },
	    {
		'acronym': 'LC',
		'definitions': 'Large Commercial'
	    },
	    {
		'acronym': 'LCAT',
		'definitions': 'Liability CAT'
	    },
	    {
		'acronym': 'L&H',
		'definitions': 'Life & Health'
	    },
	    {
		'acronym': 'LI',
		'definitions': 'Location Intelligence'
	    },
	    {
		'acronym': 'LOB',
		'definitions': 'Lines of Business'
	    },
	    {
		'acronym': 'LSF',
		'definitions': 'Leadership Success Factors'
	    },
	    {
		'acronym': 'LU',
		'definitions': 'Luxembourg'
	    },
	    {
		'acronym': 'MAAA',
		'definitions': 'Member of the American Academy of Actuaries'
	    },
	    {
		'acronym': 'MDB',
		'definitions': 'Microsoft DataBase'
	    },
	    {
		'acronym': 'MDF',
		'definitions': 'Microsoft Database File'
	    },
	    {
		'acronym': 'MDR',
		'definitions': 'Mean Damage Raito'
	    },
	    {
		'acronym': 'MFD',
		'definitions': 'Multi Family Dwelling'
	    },
	    {
		'acronym': 'MMI',
		'definitions': 'Modified Mercalli Intensity'
	    },
	    {
		'acronym': 'MTBF',
		'definitions': 'Mean Time Between Failures'
	    },
	    {
		'acronym': 'MRD',
		'definitions': 'Marketing Requirements Document'
	    },
	    {
		'acronym': 'MRI',
		'definitions': 'Multiple-Relational Import, Multi-Relational Import'
	    },
	    {
		'acronym': 'Mw',
		'definitions': 'Moment Magnitude'
	    },
	    {
		'acronym': 'MX',
		'definitions': 'MeXico'
	    },
	    {
		'acronym': 'NAIC',
		'definitions': 'National Association of Insurance Commissioners'
	    },
	    {
		'acronym': 'NAT',
		'definitions': 'National Accounts Tool'
	    },
	    {
		'acronym': 'NATHAN',
		'definitions': 'NATural Hazard Assessment Network'
	    },
	    {
		'acronym': 'NCCI',
		'definitions': 'National Council on Compensation Insurance'
	    },
	    {
		'acronym': 'NCEP',
		'definitions': 'National Centre for Environmental Prediction'
	    },
	    {
		'acronym': 'NDA',
		'definitions': 'Non-Disclosure Agreement'
	    },
	    {
		'acronym': 'NFIP',
		'definitions': 'National Flood Insurance Program'
	    },
	    {
		'acronym': 'NHC',
		'definitions': 'National Hurricane Center'
	    },
	    {
		'acronym': 'NGP',
		'definitions': 'Next Generation Platform'
	    },
	    {
		'acronym': 'NL',
		'definitions': 'NetherLands'
	    },
	    {
		'acronym': 'NOAA',
		'definitions': 'National Oceanic and Atmospheric Administration'
	    },
	    {
		'acronym': 'NPS',
		'definitions': 'Net Promoter Score'
	    },
	    {
		'acronym': 'NRF',
		'definitions': 'No Resolution Found'
	    },
	    {
		'acronym': 'NWP',
		'definitions': 'Numerical Weather Prediction'
	    },
	    {
		'acronym': 'NZ',
		'definitions': 'New Zealand'
	    },
	    {
		'acronym': 'OEP',
		'definitions': 'Occurrence Exceedance Probability'
	    },
	    {
		'acronym': 'OP',
		'definitions': 'Offshore Platform'
	    },
	    {
		'acronym': 'OKR',
		'definitions': 'Objectives and Key Results'
	    },
	    {
		'acronym': 'OPAT',
		'definitions': 'Offshore Platform Accumulation Tool'
	    },
	    {
		'acronym': 'P&C',
		'definitions': 'Property & Casualty'
	    },
	    {
		'acronym': 'PATE',
		'definitions': 'Post Analysis Treaty Editing'
	    },
	    {
		'acronym': 'PDF',
		'definitions': 'Probability Density Function, Portible Document Format'
	    },
	    {
		'acronym': 'PETS',
		'definitions': 'Platform Enginerring and TechOps'
	    },
	    {
		'acronym': 'PET',
		'definitions': 'Period Event Table'
	    },
	    {
		'acronym': 'PEQT',
		'definitions': 'Period Event Quantile Table'
	    },
	    {
		'acronym': 'PGA',
		'definitions': 'Peak Ground Acceleration, Professional Golf Association'
	    },
	    {
		'acronym': 'PLA',
		'definitions': 'Post Loss Amplification'
	    },
	    {
		'acronym': 'PLOT',
		'definitions': 'Probabilistic Loss Over Time'
	    },
	    {
		'acronym': 'PLT',
		'definitions': 'Period Loss Table'
	    },
	    {
		'acronym': 'PML',
		'definitions': 'Probable Maximum Loss'
	    },
	    {
		'acronym': 'POC',
		'definitions': 'Point Of Contact, Proof Of Concept'
	    },
	    {
		'acronym': 'POD',
		'definitions': 'Project Overview Document'
	    },
	    {
		'acronym': 'PP',
		'definitions': 'Pure Premium'
	    },
	    {
		'acronym': 'PRD',
		'definitions': 'Peril Rating Databases, Product Requirements Document'
	    },
	    {
		'acronym': 'PRSV',
		'definitions': 'PRofessional SerVices (RMS department)'
	    },
	    {
		'acronym': 'PS',
		'definitions': 'Professional Services (RMS department)'
	    },
	    {
		'acronym': 'PSE',
		'definitions': 'Product Support Engineer'
	    },
	    {
		'acronym': 'PTM',
		'definitions': 'Probabilistic Terrorism Model'
	    },
	    {
		'acronym': 'PT',
		'definitions': 'PorTugal'
	    },
	    {
		'acronym': 'PTO',
		'definitions': 'Paid Time Off'
	    },
	    {
		'acronym': 'QCC',
		'definitions': 'Quality Control Center'
	    },
	    {
		'acronym': 'QS',
		'definitions': 'Quota Share'
	    },
	    {
		'acronym': 'RA',
		'definitions': 'Risk Analyst'
	    },
	    {
		'acronym': 'RAD',
		'definitions': 'RMS Acronym Dictionary'
	    },
	    {
		'acronym': 'RAE',
		'definitions': 'Risk Analytics Engineering, Risk Analytics Engine'
	    },
	    {
		'acronym': 'RAP',
		'definitions': 'Risk Analysis Profile'
	    },
	    {
		'acronym': 'RAROC',
		'definitions': 'Risk Adjusted Return On Capital'
	    },
	    {
		'acronym': 'RBLD',
		'definitions': 'Residential, BuiLDing (in RiskLink)'
	    },
	    {
		'acronym': 'RB',
		'definitions': 'RiskBrowser'
	    },
	    {
		'acronym': 'RC',
		'definitions': 'Reinforced Concrete'
	    },
	    {
		'acronym': 'RCNT',
		'definitions': 'Residential, CoNTents (in RiskLink)'
	    },
	    {
		'acronym': 'RDK',
		'definitions': 'Risk Development Kit'
	    },
	    {
		'acronym': 'RDM',
		'definitions': 'Results Data Model'
	    },
	    {
		'acronym': 'RDO',
		'definitions': 'Risk Data Object - The Rms(One) way of storing Exposure Data.'
	    },
	    {
		'acronym': 'RDP',
		'definitions': 'Remote Desktop Processing (RiskLink environment configuration)'
	    },
	    {
		'acronym': 'RDS',
		'definitions': 'Realistic Disaster Scenarios'
	    },
	    {
		'acronym': 'RF',
		'definitions': 'River Flood'
	    },
	    {
		'acronym': 'RG',
		'definitions': 'Reinsurance Gross'
	    },
	    {
		'acronym': 'RIMS',
		'definitions': 'Risk & Insurance Management Society'
	    },
	    {
		'acronym': 'RL',
		'definitions': 'RiskLink'
	    },
	    {
		'acronym': 'RLMC',
		'definitions': 'RiskLink Mapping Component'
	    },
	    {
		'acronym': 'RM',
		'definitions': 'RiskManager'
	    },
	    {
		'acronym': 'RN',
		'definitions': 'Reinsurance Net'
	    },
	    {
		'acronym': 'ROL',
		'definitions': 'Rate On Line'
	    },
	    {
		'acronym': 'RP',
		'definitions': 'Return Period'
	    },
	    {
		'acronym': 'RPDM',
		'definitions': 'Reinsurance Platform Data Module'
	    },
	    {
		'acronym': 'RSM',
		'definitions': 'RMS Simulation Platform'
	    },
	    {
		'acronym': 'RRT',
		'definitions': 'RMS Reporting Tool'
	    },
	    {
		'acronym': 'RT',
		'definitions': 'RiskTools'
	    },
	    {
		'acronym': 'RTA',
		'definitions': 'Relative Target Attractiveness'
	    },
	    {
		'acronym': 'RUF',
		'definitions': 'RiskLink Upload Format - flat file version of EDM'
	    },
	    {
		'acronym': 'RWT',
		'definitions': 'Reinsurance Workflow Tool'
	    },
	    {
		'acronym': 'SAAS',
		'definitions': 'Software As A Service'
	    },
	    {
		'acronym': 'SAT',
		'definitions': 'System Acceptance Testing'
	    },
	    {
		'acronym': 'SD',
		'definitions': 'Standard Deviation'
	    },
	    {
		'acronym': 'SDL',
		'definitions': 'Structure Definition Language'
	    },
	    {
		'acronym': 'SDLC',
		'definitions': 'Software Delivery Lifecycle'
	    },
	    {
		'acronym': 'SE',
		'definitions': 'SwEden'
	    },
	    {
		'acronym': 'SET',
		'definitions': 'Strategic Execution Team'
	    },
	    {
		'acronym': 'SI',
		'definitions': 'Sums Insured'
	    },
	    {
		'acronym': 'SKU',
		'definitions': 'Stock Keeping Unit'
	    },
	    {
		'acronym': 'SLA',
		'definitions': 'Service Level Agreement'
	    },
	    {
		'acronym': 'SM',
		'definitions': 'Simulation Platform'
	    },
	    {
		'acronym': 'SRE',
		'definitions': 'Site Reliability Engineering'
	    },
	    {
		'acronym': 'SS',
		'definitions': 'Storm Surge, Surplus Share'
	    },
	    {
		'acronym': 'SSM',
		'definitions': 'Site Specific Module'
	    },
	    {
		'acronym': 'STEP',
		'definitions': 'STochastic EP'
	    },
	    {
		'acronym': 'SU',
		'definitions': 'SUburbs'
	    },
	    {
		'acronym': 'TAM',
		'definitions': 'Total Addressable/Available Market'
	    },
	    {
		'acronym': 'TC',
		'definitions': 'Tropical Cyclone'
	    },
	    {
		'acronym': 'TCO',
		'definitions': 'Total Cost of Ownership'
	    },
	    {
		'acronym': 'TCE',
		'definitions': 'Tail Conditional Expectation (same as TVaR)'
	    },
	    {
		'acronym': 'TH',
		'definitions': 'Tornado / Hail'
	    },
	    {
		'acronym': 'TIV',
		'definitions': 'Total Insured Value'
	    },
	    {
		'acronym': 'TMI',
		'definitions': 'Too Much Information'
	    },
	    {
		'acronym': 'TO',
		'definitions': 'TOrnado'
	    },
	    {
		'acronym': 'TOM',
		'definitions': 'Target Operating Model'
	    },
	    {
		'acronym': 'TORRO',
		'definitions': 'Tornado Research Organisation'
	    },
	    {
		'acronym': 'TR',
		'definitions': 'TeRrorism, TuRkey'
	    },
	    {
		'acronym': 'TRIA',
		'definitions': 'Terrorism Risk Insurance Act'
	    },
	    {
		'acronym': 'TSI',
		'definitions': 'Total Sums Insured'
	    },
	    {
		'acronym': 'TSM',
		'definitions': 'Terrorism Scenario Model'
	    },
	    {
		'acronym': 'TVAR',
		'definitions': 'Tail Value at Risk (same as TCE)'
	    },
	    {
		'acronym': 'TY',
		'definitions': 'Typhoon'
	    },
	    {
		'acronym': 'TYSON',
		'definitions': 'Definitely not The Batman, that\'s for sure...'
	    },
	    {
		'acronym': 'TW',
		'definitions': 'TaiWan'
	    },
	    {
		'acronym': 'UAT',
		'definitions': 'User Acceptance Testing'
	    },
	    {
		'acronym': 'UI',
		'definitions': 'User Interface'
	    },
	    {
		'acronym': 'ULAE',
		'definitions': 'Unallocated Loss Adjustment Expense'
	    },
	    {
		'acronym': 'URM',
		'definitions': 'UnReinforced Masonary'
	    },
	    {
		'acronym': 'USFL',
		'definitions': 'US Flood'
	    },
	    {
		'acronym': 'USPS',
		'definitions': 'US Postal Service'
	    },
	    {
		'acronym': 'UW',
		'definitions': 'UnderWriting'
	    },
	    {
		'acronym': 'UX',
		'definitions': 'User Experience'
	    },
	    {
		'acronym': 'VAR',
		'definitions': 'Value at Risk'
	    },
	    {
		'acronym': 'VAR',
		'definitions': 'VARiance'
	    },
	    {
		'acronym': 'VRG',
		'definitions': 'Variable Resolution Grid'
	    },
	    {
		'acronym': 'VUL',
		'definitions': 'VULnerability'
	    },
	    {
		'acronym': 'WC',
		'definitions': 'Workers Compensation'
	    },
	    {
		'acronym': 'WS',
		'definitions': 'WindStorm'
	    },
	    {
		'acronym': 'WTC',
		'definitions': 'World Trade Center'
	    },
	    {
		'acronym': 'WX',
		'definitions': 'Working eXess'
	    },
	    {
		'acronym': 'XOL',
		'definitions': 'EXcess Of Loss'
	    },
	    {
		'acronym': 'XS',
		'definitions': 'EXceSs'
	    }
	]

	definitions.map(def => {
	    console.log(def);
	    _updateDefinition({
		acronym: def.acronym,
		definition: def.definitions,
		username: 'initial data'
	    }, () => {});
	});
			
	// _updateDefinition = ({acronym, definition, docUrl, username}, callback) => {	
    });
};

