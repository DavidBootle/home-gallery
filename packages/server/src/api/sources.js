import { stat, statSync } from 'fs'
import path from 'path'

import express from 'express'

import Logger from '@home-gallery/logger'
import { sendError } from './error/index.js'

const log = Logger('server.api.sources')

const staticConfig = {index: false, maxAge: '2h'}

export async function sourcesApi(context) {
  const { config, router } = context
  /** @type {{index: string, dir: string, offline?: boolean, downloadable?: boolean}[]} */
  const sources = config.sources || []

  const downloadableSources = sources
    .filter(source => source.downloadable && !source.offline)
    .map(({index, dir}) => {
      const basename = path.basename(index)
      const indexName = basename.replace(/\.[^.]+$/, '')
      return {indexName, dir}
    })

  if (downloadableSources.length) {
    log.info(`Enable downloadable sources from indices: ${downloadableSources.map(s => s.indexName).join(', ')}`)
  }

  const indexNameToDir = downloadableSources.reduce((result, {indexName, dir}) => {
    result[indexName] = dir
    return result
  }, {})

  const sourcesRouter = express.Router()
  sourcesRouter.get('/', (_, res) => {
    res.json({
      data: downloadableSources.map(({indexName}) => ({indexName, downloadable: true}))
    })
  })

  sourcesRouter.use('/', createStaticIndex(indexNameToDir))

  router.use('/api/sources', sourcesRouter)
}

function createStaticIndex(indexNameToDir) {
  return (req, res) => {
    if (req.method != 'GET') {
      return sendError(res, 405, `Method is not allowed`)
    }

    const parts = req.path.substring(1).split('/').map(decodeURIComponent)
    if (parts.find(p => p.includes('/'))) {
      log.debug(`Reject path with invalid segment ${req.path.substring(1)}`)
      return sendError(res, 400, `Invalid path`)
    }

    const indexName = parts.shift()
    const dir = indexNameToDir[indexName]

    if (!dir || !parts.length) {
      return sendError(res, 404, `File not found`)
    }

    const file = path.normalize(path.resolve(dir, ...parts))
    const filename = path.relative(dir, file);
    if (filename.startsWith('..')) {
      log.debug(`Reject path outside of base directory ${dir}: ${req.path.substring(1)}`)
      return sendError(res, 403, `Forbidden`)
    }

    const unixFilename = path.sep != '/' ? filename.split(path.sep).join('/') : filename
    stat(file, (err, stats) => {
      if (err || !stats.isFile()) {
        log.trace({indexName, dir, filename}, `File not found: ${unixFilename} from index ${indexName}`)
        return sendError(res, 404, `File ${unixFilename} for index ${indexName} not found`)
      }
      log.trace({indexName, dir, filename}, `Send original file ${unixFilename} from index ${indexName}`)
      return res.sendFile(file)
    })
  }
}