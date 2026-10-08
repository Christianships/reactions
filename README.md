# Reactions

A personal reaction GIF library plus a Raycast extension to use it.

- `extension/` Raycast extension (Search, Add, Quick Add, Sync)
- `library/images/` the images
- `library/index.json` metadata (`id, name, tags, file, sourceUrl, addedAt, width, height, bytes`)

Images are served from `https://raw.githubusercontent.com/Christianships/reactions/main/library/images/<file>`.

## Develop

```sh
cd extension && npm install && npm run dev
```
