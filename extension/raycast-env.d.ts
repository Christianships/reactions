/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Library Folder - Git checkout containing library/images and library/index.json. */
  "libraryPath": string,
  /** GitHub Repository - owner/name, used for public URLs. */
  "githubRepo": string,
  /** Branch - Branch to sync and link to. */
  "branch": string,
  /** Sync - Commit and push after every add, edit or delete. */
  "autoSync": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search-reactions` command */
  export type SearchReactions = ExtensionPreferences & {}
  /** Preferences accessible in the `add-reaction` command */
  export type AddReaction = ExtensionPreferences & {}
  /** Preferences accessible in the `quick-add-reaction` command */
  export type QuickAddReaction = ExtensionPreferences & {}
  /** Preferences accessible in the `sync-reactions` command */
  export type SyncReactions = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search-reactions` command */
  export type SearchReactions = {}
  /** Arguments passed to the `add-reaction` command */
  export type AddReaction = {}
  /** Arguments passed to the `quick-add-reaction` command */
  export type QuickAddReaction = {
  /** Image or GIF page URL */
  "url": string,
  /** Name */
  "name": string,
  /** Tags (comma separated) */
  "tags": string
}
  /** Arguments passed to the `sync-reactions` command */
  export type SyncReactions = {}
}

