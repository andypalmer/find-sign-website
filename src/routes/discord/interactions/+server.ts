import { error, json } from '@sveltejs/kit';
import { InteractionType, InteractionResponseType, MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions'
import { search } from '$lib/search/search.js'
import { getSearchLibrary } from '$lib/search/search.js'
import { getRandomSigns } from '$lib/search/random.js'
import { discordRequest, isValidReq } from '../_discord_request.js'
import { times } from '$lib/functions/iters.js'
// import { lagSwitch } from '$lib/functions/delay.js'
import { DiscordAppID } from '../_setup.js'
// import { sha256, arrayToHex } from '$lib/search/hash.js'
import type { EncodedSearchDataEntry, SearchDataEncodedMedia } from '$lib/orthagonal/types.js'
import { recordAnalytics } from '$lib/models/analytics.js'

const MaxPages = 3

async function signToMessage ({ sign, request, message = '', components = [], bodyOverride = {} }: { sign: EncodedSearchDataEntry, request: Request, message?: string, components?: any[], bodyOverride?: any }) {
  // const permalink = new URL(`/sign/${encodeURIComponent(sign.provider)}/${encodeURIComponent(sign.id)}`, request.url)
  const sources: SearchDataEncodedMedia = sign.media[0]
  const source = sources.encodes.find(x => x.type.startsWith('video/mp4'))
  // const videoTypeLabel = source.type.split('/')[1]
  // const videoResponse = await fetch(source.src)

  // const attachment = {
  //   fieldname: 'files[0]',
  //   filename: `${arrayToHex(await sha256(source.src))}.${source.type.split('/')[1]}`,
  //   data: new Uint8Array(await videoResponse.arrayBuffer()),
  //   type: videoResponse.headers.get('Content-Type')
  // }

  return {
    content: [
      message,
      `Auslan: “**${sign.title || sign.words.join('**”, “**')}**”`,
      `Link: <${sign.link}>`,
      // sign.body,
      source.url
    ].join('\n'),
    components,
    // attachments: [{
    //   id: 0,
    //   filename: attachment.filename,
    //   description: sign.title || sign.words.join(', ')
    // }],
  }//, attachment
}

function placeholderMessage () {
  return { type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE }
}

async function runSearch (query: string, request, page = 0, bodyOverride?: any) {
  const { results, totalResults } = await search(`${query} -#lexis.fingerspell`, page, 1)
  if (totalResults > 0) {
    const sign = results[0]
    const message = `searched “**${query}**”\n`
    const components = [
      { type: MessageComponentTypes.ACTION_ROW,
        components: [
          ...times(Math.min(MaxPages, totalResults), i => {
            return {
              type: MessageComponentTypes.BUTTON,
              custom_id: `page:${encodeURIComponent(query)}:${i}`,
              label: `${i+1}`,
              style: page === i ? ButtonStyleTypes.PRIMARY : ButtonStyleTypes.SECONDARY,
              disabled: page === i,
            }
          }),
          { type: MessageComponentTypes.BUTTON,
            custom_id: 'del',
            label: 'Remove',
            style: ButtonStyleTypes.SECONDARY,
          },
        ],
      },
    ]
    return await signToMessage({ sign, request, message, components, bodyOverride })
  } else {
    return { body: {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Auslan: no result found for “${query}”`},
      ...(bodyOverride || {})
    }}
  }
}

export async function POST ({ request }: { request: Request}) {
  const bodyText = await request.text()
  if (!isValidReq(request, bodyText)) error(401, 'Bad request signature')

  const { type, id, data, token, member, message } = JSON.parse(bodyText)

  if (type === InteractionType.PING) {
    return json({ type: InteractionResponseType.PONG })
  } else if (type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = data
    if (name === 'auslan') {
      const { value: query } = options.find(x => x.name === 'query')
      runSearch(query, request, 0).then(async result => {
        // PATCH `/webhooks/${DiscordAppID}/${token}/messages/@original`
        discordRequest(`webhooks/${DiscordAppID}/${token}/messages/@original`, {
          method: 'PATCH',
          body: result
        })
      })

      recordAnalytics('discord/search', 1)

      return json(placeholderMessage())
    } else if (name === 'random-auslan') {
      const [random] = await getRandomSigns(1)
      const library = await getSearchLibrary([random.index], ['id'])
      const sign = await library[random.index].entries.find(x => x.id === random.id).load()

      recordAnalytics('discord/random', 1)

      if (member) {
        // it's a guild request
        const userId = member.user.id
        signToMessage({ sign, request, message: `<@${userId}> 🎲 rolled the dice…`}).then(message => {
          discordRequest(`webhooks/${DiscordAppID}/${token}/messages/@original`, { method: 'PATCH', body: message })
        })
        return json(placeholderMessage())
      } else {
        // it's a DM
        signToMessage({ sign, request, message: `You rolled the dice 🎲`}).then(message => {
          discordRequest(`webhooks/${DiscordAppID}/${token}/messages/@original`, { method: 'PATCH', body: message })
        })
        return json(placeholderMessage())
      }
    }
  } else if (type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = data
    const [command, ...opts] = custom_id.split(':')
    if (command === 'del') {
      return json({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: {
          content: '[ Search Result Removed ]',
          components: [],
          attachments: [],
        }
      })
    } else if (command === 'page') {
      const [query, page] = opts.map(x => decodeURIComponent(x))
      runSearch(query, request, parseInt(page)).then(result =>
        // discordRequest(`webhooks/${DiscordAppID}/${token}/messages/@original`, { method: 'PATCH', body: {
        //   type: InteractionResponseType.UPDATE_MESSAGE,
        //   data: result
        // }})

        // PATCH `/webhooks/${DiscordAppID}/${token}/messages/@original`
        discordRequest(`webhooks/${DiscordAppID}/${token}/messages/@original`, {
          method: 'PATCH',
          body: result
        })
      )

      return json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE })
    }
  }

  error(500, 'why u do??')
}