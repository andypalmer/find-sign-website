# Find Sign Website (2022 rebuild)

Original find-sign (sign-search repo) was a totally nuts mess of code that was almost impossible to maintain and easy to get lost in. 2022 has been a time for cleaning up that mess, which has included a total, gradual rewrite of everything. This project is a from scratch rewrite of the web searching UI in SvelteKit. It does not include anything to do with building data that this reads and searches.

## Layout

This repo is a set of npm workspaces. Run `npm install`, `npm test`, `npm run check` and `npm run build` from the top
folder; they cover every workspace. `npm run dev` starts the public site and `npm run dev:admin` the admin app. See
`dev/README.md` for local https.

- `apps/site`: the public website. Anonymous: no logins or cookies, and it never holds the data server write
  identity (its build refuses to run if `VITE_SEARCH_WRITE_IDENTITY` is set).
- `apps/admin`: the admin app (index builds, overrides, users, audit log, `/automation/build-index`). It holds the
  write identity and runs on its own hostname.
- `packages/core`: index reading, search, shared utilities and ui, used by both apps.
- `packages/data-io`: the find-sign-data client, which signs requests with the write identity.
- `packages/indexer`: builds search indexes from encoded-search-data and publishes them.
- `packages/test-helpers`: the fake data server, fixtures and test env shared by every workspace's tests.

Each app has its own `.env`; start from its `example.env`.

## Requirements

1. The website needs a precomputed vector dataset, that translates written words in to a word2vec type of vector space. Auslan Find Sign uses Facebook/Meta's FastText common-crawl english. This is converted to a compact sharded format using [find-sign-vectors-builder](https://github.com/auslan-find-sign/find-sign-vectors-builder) which creates the needed output that can be served on any static http server. The path to this output needs to be configured in `apps/site/.env` and `apps/admin/.env` - take a look at each app's `example.env` to see how this file is made. `find-sign-vector-builder` has instructions on usage, and fasttext provides premade data for almost every popular written language on earth.
2. The website needs a search index. This is currently being built with legacy code from the old project. TODO: reimplement a cleaner search index builder.
3. If you want the discord bot, you'll need to register a dev account on discord, make a bot, and provide the needed secrets in `apps/site/.env`. the endpoint url to use is `https://yoursite/discord/interactions`. You'll also need to manually visit `/discord/setup` with curl or a web browser to get find-sign-website to upload the discord slash commands to their systems. Consider curling this url as part of your deployment cycle.

## TODO List:

 - Implement new search index format, and make a builder
 - Admin WebUI where manual results corrections can be nicely entered?
 - Privacy preserving analytics?

## I want to contribute data, how can I best make it accessible to find sign?

Anything Facebook/Meta makes is hell, and youtube is only a slightly lesser hell. The very best thing you can do to fill my life with joy, is publish your video files as static files on a web server you control, along with a search-data.json file. YAML is also acceptable.

`search-data` is find sign's native format for representing data that goes in to the search index. Your videos can be in any format, as they will be transcoded before being presented to users. If you're recording videos from scratch, 16:9 horizontal looks great on this site.

### `search-data` format:

your search data should be a JSON object in which each key/property name is a string which uniquely represents that sign and will not change when you add or remove data. It should ideally be fairly short and work well in a URL, like "forever-1". The value of these properties should be as such:

```json
{
  "title": "Any plain text title that should show as a clickable heading in the search result",
  "words": ["list", "of", "words"],
  "body": "a string description of your video, which may include\na few different\nlines",
  "link": "https://link-to-root.tld/some/section/specific/entry.html",
  "nav": [
    ["Site Name", "https://link-to-root.tld/"],
    ["Subsection name", "https://link-to-root.tld/some/section"],
    ["Specific Page", "https://link-to-root.tld/some/section/specific/entry.html"]
  ],
  "tags": ["list", "of", "hashtags"],
  "media": [
    { "method": "fetch", "url": "https://media.your-site.tld/path/to/whatever.mp4", "version": "version-1" }
  ],
  "author": {
    "id": "persons-username",
    "name": "Person's Name",
    "link": "https://your-site.tld/user/profile",
    "avatar": "https://your-site.tld/user/profile/avatar.jpeg"
  },
  "provider": {
    "id": "identifier-for-provider",
    "name": "Friendly Name of Provider",
    "verb": "documented",
    "link": "https://your-site.tld/"
  }
}
```

You can, if you choose, omit `title`, in which case it will default to the unique key of this entry in the search data file. `words` are always the searchable thing. If `words` are not provided, Find Sign will make a best effort attempt to extract them automatically from `title`. If both `title` and `words` are omitted, the search data is invalid and cannot be indexed. words list will be transformed in to word vectors and compared against user's search terms to rank results, so it's content should usually be quite similar to the title string if both are provided. Words should not include punctuation like `.` or `,` or quote marks.

Newlines are rendered correctly in body text, and in the future basic markdown maybe supported there, but html never will.

`link` specifies where the user is sent when they click the title or videos. If omitted, find-sign will link to it's own permalink page about the entry.

`nav` if provided, will cause a breadcrumbs-like link under the title to be rendered, which looks nicer for users. It's a great place to put some branding, and should reflect the structure of your site. If it's missing, `link` will be used, and if that's missing, a Find Sign permalink will be used by default.

`tags` is optional, and can be provided as a list of hashtags. Each string must not contain whitespace. It should only contain characters that are easy to type like a-z0-9 and may also use `.`, and `-` seperators. No other punctuation may be present and the strings should not begin with a `#`. If you know which states a sign is used in, please include hashtags like `nsw` and `vic` in the list to indicate which states your sign is used in.

`media` must be present, and must be an array of Media Elements (see below).

`author` is optional, if provided it should include an `"id"` field, which can be used with searching for `@username` or `-@username` queries. The other fields are currently not used by find sign and exist for future proofing against ideas for new ways to display search results. If avatar is provided, it should be a square image in a web compatible format like jpeg, png, gif, or webp. Username will be shown along side hashtags in search results if available.

`provider` is optional. If provided, it should specify a unique `id` for your site/corpus, a `link` to a webpage about your site/corpus, a `verb` which is used in the Find Sign homepage when describing new entries added recently, and a friendly `name` for your website, also used on the homepage and feeds. The provider value should normally be the same for every entry in your search data file, though it might make sense to vary the verb (i.e. `"made up"` or `"recorded"` or `"shared"`)

### Media Elements

Media elements are an object, with `method` set to `"fetch"` and `url` set to either a relative or absolute https/http url that directly points to a video file (like .mp4, mkv, etc). If a relative path is provided it will be understood as relative to where you host your search-data.json, like how `<a>` links in html work.

You may also add a `version` property to this object, with any string value which will change when you modify your media (like a hash of the file's contents, or a file last modified date). If you don't provide a `version` find-sign will not normally redownload your videos so changes wont be detected for a long time.

You may also provide a `clipping` property, which is an object containing optional `start` and `end` properties. If start is specified, it must be a number, which is how many seconds find-sign should skip in to the start of the video before transcoding, clipping off that many seconds from the beginning. If end is specified, it is how many seconds deep in to the video the clip should include. if both are provided, end must be a larger number than start. Start defaults to 0 and end defaults to the intrinsic duration of the video file.

If you have a video that contains several signs, you can reference the same video url in multiple search-data entries, and use clipping to control which section of the video is presented to the user. You could also use it to skip past intro logos or exclude end credits from the loop seen on find-sign.

### Minimal example of search data

```json
{
  "Welcome to latrobe university": {
    "media": [{ "method": "fetch", "url": "./welcome-to-ltu.ogg" }]
  },
  "How are you?": {
    "media": [{ "method": "fetch", "url": "how-are-you.mp4" }]
  }
}
```

It is possible to publish an extremely minimal search data file like above. Title will be implied from object keys, and words extracted from title. The only mandatory field really is media. Downside's to this approach:

- not providing version on media means changes to the video file wont be noticed for a long time
- any small changes to the object key to edit title will break permalinks and may cause media to be downloaded and encoded again in some cases
- no control over presentation of discovery feed on homepage or listing of states in hashtags for usage regions limits utility of information

If you can provide more info, please do.
