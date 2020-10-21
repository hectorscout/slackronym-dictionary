module.exports = function(app, db, web) {
  const token = process.env.SLACKRONYM_TOKEN;
  const adminChannelId = process.env.SLACKRONYM_ADMIN_CHANNEL_ID;
  const request = require('request');
  const ObjectID = require('mongodb').ObjectID;

  const ADD_ACK_ID = 'addAck';
  const DEFINE_ACK_DIALOG_ID = 'defineAckDialog';
  const ANON_ACK_DIALOG_ID = 'anonAckDialog';
  const REVERT_ACK_ID = 'revertAck';
  const DUMB_VALUE = 'A very dumb thing that noone will type into the thing';
  const MESSAGE_LOOKUP_ID = 'messageLookUp';

  let messageIds = {};


  _getItemAttachment = (item, {update, user, timestamp, revert} = {}) => {
    let itemAttachment = {
      title: `${item.acronym}:`,
      text: item.definition,
      fields: []
    };
    if (item.docUrl) {
      itemAttachment.fields.push({
        title: 'Documentation',
        value: item.docUrl,
        short: false
      });
    }
    if (user) {
      itemAttachment.fields.push({
        title: 'Added By',
        value: item.username,
        short: true
      });
    }
    if (timestamp) {
      itemAttachment.fields.push({
        title: 'Timestamp',
        value: item.timestamp,
        short: true
      });
    }
    if (update) {
      itemAttachment.callback_id = ADD_ACK_ID;
      itemAttachment.actions = [{
        name: 'request',
        text: 'Update',
        type: 'button',
        value: item.acronym
      }];
    }
    if (revert) {
      itemAttachment.callback_id = REVERT_ACK_ID;
      itemAttachment.actions = [{
        name: 'revert',
        text: 'Revert',
        type: 'button',
        value: item._id
      }];
    }
    return itemAttachment;
  };


  _getListResponse = (callback) => {
    db.collection('definitions').distinct('acronym', (err, acronyms) => {
      if (err) {
        callback({text: 'There was an error trying to get all the available acronyms. Please try again later.'});
      }
      else {
        acronyms.sort();
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
  };


  _getDefinitionsItem = (acronym, callback) => {
    const query = {
      acronym: acronym,
      removed: {$in: [false, null]}
    };
    const cursor = db.collection('definitions').find(query).sort({timestamp: -1}).limit(1);
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
  };


  _getRequestedResponse = callback => {
    let cursor = db.collection('definitions').aggregate([
      {$sort: {timestamp: -1}},
      {$group: {
          _id: '$acronym',
          acronym: {$first: '$acronym'},
          definition: {$first: '$definition'},
        }},
      {$match: {
          definition: null,
          removed: {$in: [false, null]}
        }},
    ]);
    cursor.toArray((err, items) => {
      let attachments = [];
      let text = 'No undefined requests.';
      console.log(items);
      if (items.length) {
        attachments = items.map(item => _getItemAttachment(item, {update: true}));
        text = 'The following acronym(s) have been requested';
      }
      callback({
        text: text,
        attachments: attachments
      });
    });
  };


  _getStatAttachment = (command) => {
    console.log(command);
    return {
      title: command._id,
      text: command.count
    }
  };


  _getStatsResponse = callback => {
    let allTimeLookups = db.collection('commands').aggregate([
      {$group: {
          _id: '$result',
          result: {$first: '$result'},
          count: {$sum: 1}
        }},
      {$sort: {count: -1}},
      {$limit: 3}
    ]);
    let allTimeDefined = db.collection('commands').aggregate([
      {$group: {
          _id: '$command',
          command: {$first: '$command'},
          count: {$sum: 1},
          result: {$first: '$result'}
        }},
      {$match: {result: {$in: ['DEFINED', 'NOT FOUND']}}},
      {$sort: {count: -1}}
    ]);
    let attachments = [];
    // allTimeLookups.toArray((err, commands) => {
    // 	attachments = attachments.concat(commands.map(command => _getStatAttachment(command)));
    // });
    allTimeDefined.toArray((err, commands) => {
      console.log(commands);
      attachments = attachments.concat(commands.map(command => {return {title: command.command, text: command.count}}));
      let text = 'Of all time...';
      callback({
        text: text,
        attachments: attachments
      });
    });
  };

  _openAnonDialog = (trigger_id, text) => {
    _openAddDialog(trigger_id, {text})
    // web.dialog.open({
    //   trigger_id,
    //   dialog: {
    //     callback_id: ANON_ACK_DIALOG_ID,
    //     title: 'Make An Anonymous Comment',
    //     submit_label: 'Post',
    //     notify_on_cancel: false,
    //     elements: [
    //       {
    //         types: 'text',
    //         label: 'Anonymous Comment',
    //         name: 'anonText',
    //         value: text
    //       }
    //     ]
    //   }
    // })
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
              hint: "FYI: If this is dumb, we'll just remove it... and ban you ¯\\_(ツ)_/¯"
            }
          ]
        }
      });
    });
  };


  _updateDefinition = ({acronym, definition, docUrl, username}, callback) => {
    definition = {
      acronym: acronym.toUpperCase(),
      definition: definition,
      docUrl: docUrl,
      username: username,
      timestamp: new Date().toISOString()
    };
    db.collection('definitions').insertOne(definition, callback);
  };


  _updateMessage = (userId, message) => {
    let options = {
      url: messageIds[userId],
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-type': 'application/json'
      },
      body: JSON.stringify(message)
    };
    request.post(options, (err, response, body) => {
      console.log('err', err);
      // console.log('response', response);
      // console.log('body', body);
    });
  };


  _updateCallback = (err, result, res, userId, originalItem) => {
    if (err) {
      res.send('There was... a _problem_...');
    }
    else {
      let item = result.ops[0];
      let confirmationMessage = {
        text: `A request to add \`${item.acronym}\` has been submitted on your behalf.`
      };
      if (item.definition) {
        confirmationMessage = {
          text: `We successfully updated the dictionary with your definition of \`${item.acronym}\`.`,
          attachments: [_getItemAttachment(item)]
        };
      }
      _updateMessage(userId, confirmationMessage);
      res.send();

      let notificationMessage = {
        text: `${item.username} just added or updated this...`,
        channel: adminChannelId,
        attachments: [_getItemAttachment(item, {user: true, revert: true}), _getItemAttachment(originalItem, {user: true})]
      };
      web.chat.postMessage(notificationMessage);
    }
  };


  _postMessageLookup = ({channel, user, message}) => {
    const words = message.replace(/[^\w\s]/g,'').split(' ').map(x => x.toUpperCase());
    let cursor = db.collection('definitions').aggregate([
      {$match: {acronym: {$in: words}, removed: {$in: [false, null]}}},
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
      let text = 'No acronyms we know about in that message.';
      if (items.length) {
        attachments = items.map(_getItemAttachment);
        text = message;
      }
      web.chat.postEphemeral({
        text: text,
        channel: payload.channel.id,
        user: payload.user.id,
        attachments: attachments
      });
    });
  };


  _recordCommand = (command, username, result) => {
    let definition = {
      command: command,
      username: username,
      result: result,
      timestamp: new Date().toISOString()
    };
    db.collection('commands').insertOne(definition);
  };


  // Commands from interactive stuff like buttons and dialogs
  app.post('/request', (req, res) => {
    let payload = JSON.parse(req.body.payload);
    console.log('/request');
    console.log('payload', payload);

    switch (payload.callback_id) {
      case ADD_ACK_ID:
        // Clicked a `We should add it`, `I was just being dumb`, or `Update` button
        let value = payload.actions[0].value;
        if (value === DUMB_VALUE) return res.send({text: 'https://media1.giphy.com/media/l0ExsczAepXFxWSw8/200.gif'});
        messageIds[payload.user.id] = payload.response_url;
        _openAddDialog(payload.trigger_id, {acronym: value});
        res.send({text: 'Defining an acronym (_like a boss_)'});
        break;
      case ANON_ACK_DIALOG_ID:
        _updateMessage(payload.user.id, {text: payload.submission.anonText})
      case DEFINE_ACK_DIALOG_ID:
        // Closed the add definitions dialog
        if (payload.type === 'dialog_cancellation') {
          _updateMessage(payload.user.id, {text: 'You did the right thing.'});
        }
        else {
          _getDefinitionsItem(payload.submission.acronym, (err, originalItem) => {
            _updateDefinition({
              acronym: payload.submission.acronym,
              definition: payload.submission.definition,
              docUrl: payload.submission.docUrl,
              username: payload.user.name
            }, (err, result) => _updateCallback(err, result, res, payload.user.id, originalItem));
          })
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
        break;
      case REVERT_ACK_ID:
        // Set an acronym definition as removed
        console.log(payload.channel.id, adminChannelId);
        if (payload.channel.id !== adminChannelId) {
          return res.send({text: "Not sure how you tried that, but you can't do it here..."});
        }
        let id = payload.actions[0].value;
        let query = {_id: ObjectID(id)};
        let newValues = {$set: {removed: true}};
        db.collection('definitions').updateOne(query, newValues, (err, result) => {
          db.collection('definitions').findOne({_id: ObjectID(id)}, (err, item) => {
            _getDefinitionsItem(item.acronym, (err, item) => {
              if (err) {
                console.log('err:', err);
                res.send({error: err});
              }
              else if (!item.definition) {
                res.send({text: `\`${item.acronym}\` is no longer defined.`});
              }
              else {
                response = {
                  text: `Definition for \`${item.acronym}\` has fallen back to:`,
                  attachments: [_getItemAttachment(item, {revert: true, user: true, timestamp: true})]
                };
                res.send(response);
              }
            });
          });
        });
    }
  });


  _sendCommandResponse = (res, response, reqBody, status) => {
    _recordCommand(reqBody.text, reqBody.user_name, status);
    res.send(response);
  };


  _getHelpResponse = (isAdminChannel) => {
    let attachments = [
      {
        title: '/rad rms',
        text: 'Look up \`RMS\`.'
      },
      {
        title: '/rad update rms',
        text: 'Update the definition for \`RMS\`.'
      },
      {
        title: '/rad requested',
        text: 'Get a list of all the acronyms that have been requested and still have no definition.'
      },
      {
        title: '/rad whodid rms',
        text: 'Find out who was the last person to update \`RMS\`.'
      },
      {
        title: '/rad list',
        text: 'List all the available acronyms in one ugly list.'
      }
    ];

    if (isAdminChannel) {
      attachments.push({
        title: '/rad revert rms',
        text: 'Revert the current definition of \`RMS\`. If there is a previous definition it will fall back to that. Otherwise, it will just be undefined. \`REVERT\` is only available in this channel.'
      });
    }

    return {
      text: 'Available Commands:',
      attachments: attachments
    }
  };


  // Main commands
  app.post('/anon', (req, res) => {
    console.log('Trying to post anonymously.', req.body.trigger_id)

    const text = req.body.text;
    _openAnonDialog(req.body.trigger_id, req.body.text)
    // res.send({text, response_type: 'in_channel', delete_original: true});
    res.send()
  })

  app.post('/lookup', (req, res) => {
    console.log('/lookup');
    console.log('request body', req.body);
    const text = req.body.text.replace(/[^\w\s&]/g,'');
    let key = text.toUpperCase();
    const command = key.split(' ')[0];
    const update = command === 'UPDATE';
    const whodid = command === 'WHODID';
    const revert = command === 'REVERT';
    if (update || whodid || revert) {
      key = key.split(' ')[1] || '';
    }

    if (revert && req.body.channel_id !== adminChannelId){
      const response = {text: "Sorry, you can't \`revert\` here..."};
      _sendCommandResponse(res, response, req.body, 'REQUESTED');
    }
    else if (key === 'LIST') {
      _getListResponse((response) => _sendCommandResponse(res, response, req.body, 'LIST'));
    }
    else if (key === 'HELP' || !key) {
      _sendCommandResponse(res, _getHelpResponse(req.body.channel_id === adminChannelId), req.body, 'HELP');
    }
    else if (key === 'REQUESTED') {
      _getRequestedResponse((response) => _sendCommandResponse(res, response, req.body, 'REQUESTED'));
    }
    else if (key === 'CHANNELID') {
      // Util to get the channel id to set for ADMIN_CHANNEL_ID
      _sendCommandResponse(res, {text: `channel_id: ${req.body.channel_id}`}, req.body, 'CHANNELID');
    }
    else if (key === 'STATS') {
      _getStatsResponse((response) => _sendCommandResponse(res, response, req.body, 'STATS'));
    }
    else {
      _getDefinitionsItem(key, (err, item) => {
        if (err) {
          console.log('err:', err);
          _sendCommandResponse(res, {error: err}, req.body, err)
        }
        else if (!item.definition) {
          _sendCommandResponse(res, _getUnknownResponse(key), req.body, 'NOT FOUND')
        }
        else {
          const attachmentOptions = {
            update: update,
            user: (whodid || revert),
            timestamp: (whodid || revert),
            revert: revert
          };
          const response = {
            text: '',
            attachments: [_getItemAttachment(item, attachmentOptions)]
          };
          let status = 'DEFINED';
          if (update) status = 'UPDATE';
          if (whodid) status = 'WHODID';
          if (revert) status = 'REVERT';
          _sendCommandResponse(res, response, req.body, status);
        }
      });
    }
  });

  // populate all the definitions we had before...
  app.get('/populate', (req, res) => {
    const definitions = require('./definitions').definitions;

    definitions.map(def => {
      console.log(def);
      _updateDefinition({
        acronym: def.acronym,
        definition: def.definitions,
        username: 'initial data'
      }, () => {});
    });
  });
};
