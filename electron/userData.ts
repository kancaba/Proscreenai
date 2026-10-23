import { app } from 'electron'
import path from 'node:path'

// Product renaming must not move existing brands, keys, recordings or drafts.
// Explicit custom profiles (including isolated tests) keep their own path.
const currentUserData = app.getPath('userData')
if (path.dirname(currentUserData) === app.getPath('appData') && /^pro[ -]?screen[ -]?ai$/i.test(path.basename(currentUserData))) {
  app.setPath('userData', path.join(app.getPath('appData'), 'screenmovie'))
}

export const userDataDirectory = app.getPath('userData')
