import path from 'path';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url'

import { loggerMiddleware } from './logger-middleware.js'
import { databaseApi } from './api/database/index.js';
import { treeApi } from './api/database/tree/index.js';
import { eventsApi } from './api/events/index.js';
import { webapp } from './webapp.js';
import { augmentReqByUserMiddleware, createBasicAuthMiddleware, defaultIpWhitelistRules } from './auth/index.js'
import { isIndex, skipIf } from './utils.js'
import { debugApi } from './api/debug/index.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const webappDir = path.join(__dirname, 'public')

function shouldCompress (req, res) {
  if (req.headers['x-no-compression']) {
    return false
  }

  return compression.filter(req, res)
}

const getAuthMiddleware = config => {
  const users = config.server?.auth?.users || []
  const rules = config.server?.auth?.rules || defaultIpWhitelistRules
  if (users.length) {
    return createBasicAuthMiddleware(users, rules)
  }
  return (req, _, next) => next()
}

export function createApp(context) {
  const { config } = context
  const app = express();
  app.disable('x-powered-by')
  app.enable('trust proxy')

  app.use(augmentReqByUserMiddleware())
  app.use(loggerMiddleware())
  app.use(cors());
  app.use(compression({ filter: shouldCompress }))

  app.use(skipIf(express.static(webappDir, {maxAge: '1h'}), isIndex))

  app.use(getAuthMiddleware(config))

  app.use('/files', express.static(config.storage.dir, {index: false, maxAge: '2d', immutable: true}));
  // app.use('/rawimage', express.static(config.sources.dir, {index: false, maxAge: '2d', immutable: true}))
  app.use(bodyParser.json({limit: '1mb'}))

  const { read: readEvents, push: pushEvent, stream, getEvents } = eventsApi(context, config.events.file);
  const { read: readDatabase, init: initDatabase, getFirstEntries, getDatabase } = databaseApi(context, config.database.file, getEvents);
  const { read: readTree } = treeApi(context, getDatabase);

  app.get('/api/events.json', readEvents);
  app.get('/api/events/stream', stream);
  app.post('/api/events', pushEvent);
  app.get('/api/database.json', readDatabase);
  app.get('/api/database/tree/:hash', readTree);
  app.get('/api/config', (req, res) => {
    res.json(config);
  });

  if (config.server.remoteConsoleToken) {
    const { console } = debugApi({remoteConsoleToken: config.server?.remoteConsoleToken})
    app.post('/api/debug/console', console);
  }

  // add direct link to download raw photos
  app.get('/api/rawphoto/:filename', (req, res) => {
    const filename = req.params.filename;

    if (!filename) {
      res.sendStatus(404);
      return;
    }
    
    // decode URI to get standard characters, including spaces
    const decodedName = decodeURI(filename);

    // remove all preceding file elements to avoid a get api having full access to all files on the server
   const decodedSafeName = decodedName.substring(decodedName.lastIndexOf('/') + 1);
    
    res.sendFile(`/data/Pictures/${decodedSafeName}`, (err) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.send(`Error occurred accessing file: ${err}`);
      }
      return;
    })

  });

  // deprecated
  app.get('/api/database', readDatabase);
  app.get('/api/events', readEvents);

  const getWebAppState = async (req) => {
    const disabled = config?.webapp?.disabled || []
    const entries = await getFirstEntries(50, req)
    return {
      disabled: !!req.username ? [...disabled, 'pwa'] : disabled,
      entries
    }
  }

  const webAppOptions = {
    basePath: (config.server.basePath || '').replaceAll(/\/+/g, '') + '/',
    injectRemoteConsole: !!config.server.remoteConsoleToken,
  }

  app.use(webapp(webappDir, getWebAppState, webAppOptions))

  return {
    app,
    initDatabase
  }
}
