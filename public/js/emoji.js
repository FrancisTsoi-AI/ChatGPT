(function () {
  const HB = window.HB;
  const h = HB.h;

  // Each line: emoji followed by space-separated keywords (first words are the best matches).
  const DATA = {
    '🧰 Work': `
💻 computer laptop code github git programming dev
🖥 desktop monitor screen pc
⌨ keyboard type
🖱 mouse click
📧 email mail gmail outlook message inbox
✉ envelope mail letter email
📅 calendar date schedule agenda
🗓 planner calendar week
📆 calendar month
⏰ alarm clock time reminder
📝 note memo write notes document
📄 page document doc file paper
📃 document page text
📑 tabs bookmarks pages
📋 clipboard list tasks checklist form
📌 pin important
📎 paperclip attachment attach
🔗 link url chain
📂 folder open files drive
📁 folder files directory drive
🗂 index dividers files organise
🗃 card file archive
🗄 cabinet archive files storage
📊 chart bar stats analytics sheet spreadsheet excel
📈 growth chart up trend stocks
📉 decline chart down
💼 briefcase work business job office
🏢 office building company work
🖊 pen write
✏ pencil write edit draw
🖋 fountain pen sign
📏 ruler measure
✂ scissors cut
🔍 search magnify find look
🔎 search zoom find
🔒 lock secure private password
🔓 unlock open
🔑 key password login
⚙ settings gear config admin
🛠 tools build fix settings
🔧 wrench tool fix
📞 phone call telephone
📱 mobile phone smartphone app
📠 fax
🖨 printer print
💾 save disk floppy
☁ cloud storage drive icloud dropbox
🌐 web internet globe website browser
📡 antenna signal wifi network
🔔 bell notification alert
📢 announcement loudspeaker news
🗣 speak talk say
💬 chat message talk slack whatsapp messenger sms comment
🗨 speech chat
✅ done check task todo tick complete
☑ checkbox tick done
❗ important alert warning
🎯 target goal focus aim
🚀 rocket launch startup ship fast
💡 idea bulb light tip
🧠 brain think mind ai learn
🤖 robot ai bot chatgpt claude assistant automation
`,
    '🎓 Study': `
🎓 graduation university degree phd study school scholar
📚 books library read study reading
📖 book open read
📕 book red read
📗 book green read
📘 book blue read
📙 book orange read
📓 notebook notes
📔 notebook decorative
📒 ledger notebook
🔬 microscope science research lab
🔭 telescope astronomy science space
🧪 test tube chemistry experiment lab
🧬 dna biology genetics
⚗ alembic chemistry
🧮 abacus calculator maths math
➗ divide maths math
➕ plus add math
✖ multiply times math
🧾 receipt invoice bill
🏫 school building university campus
🏛 library museum institution classical government
🧑‍🏫 teacher lecturer professor teach
🧑‍🎓 student scholar learner
📐 triangle ruler geometry math
🗺 map world geography maps
🌍 earth globe world europe africa
🌏 earth globe asia world hong kong
🌎 earth globe americas world
🔤 letters abc alphabet english language
🈶 chinese language japanese
🔠 uppercase letters
🅰 a blood type
🗒 notepad notes spiral
🔖 bookmark tag save
🏷 label tag price
💭 thought think idea cloud
❓ question help ask
❔ question
📜 scroll paper history old
📰 newspaper news press article
🗞 newspaper rolled news
🎒 backpack school bag
🖍 crayon colour draw
🧑‍💻 developer programmer coder
`,
    '🎵 Media': `
🎵 music note song audio
🎶 music notes song
🎧 headphones music listen podcast audio
🎤 microphone sing karaoke speak podcast
🎙 studio microphone podcast recording
📻 radio
🎬 clapper film movie video cinema
🎥 movie camera video film
📹 video camera record
📷 camera photo picture
📸 camera flash photo
🖼 picture frame image art gallery
🎨 art palette paint design colour creative
🎮 game controller gaming play video games
🕹 joystick game arcade
🎲 dice game chance board
♟ chess game strategy
🧩 puzzle jigsaw game piece
📺 television tv watch youtube video stream
▶ play start video youtube
⏯ play pause
⏸ pause
⏹ stop
🔊 speaker volume sound loud
🔇 mute silent
📼 vhs tape video
🎞 film frames movie
🎭 theatre drama masks performing arts
🎹 piano keyboard music
🎸 guitar music rock
🥁 drums music
🎻 violin music classical
🎷 saxophone jazz music
`,
    '🛒 Life': `
🏠 home house
🏡 house garden home
🏦 bank money finance
💰 money bag cash
💵 dollar cash money bill
💳 credit card payment pay bank
🪙 coin money
💸 money spending flying cash
🧾 bill receipt expense
🛒 shopping cart buy amazon store shop groceries
🛍 shopping bags retail buy
🏪 store shop convenience
🍽 dining plate eat restaurant food
🍴 cutlery fork knife food eat
☕ coffee tea cafe drink hot
🍵 tea green drink matcha
🍺 beer drink pub
🍷 wine drink
🥗 salad healthy food
🍎 apple fruit health
🍕 pizza food
🍔 burger food fast
🍜 noodles ramen food asian
🍣 sushi japanese food
🛫 flight departure plane travel airline
✈ airplane plane travel flight
🚆 train rail travel transport
🚇 metro mtr subway underground transport
🚌 bus transport
🚗 car drive transport taxi
🚲 bicycle bike cycle
🏨 hotel stay travel booking
🧳 luggage travel trip suitcase
🏖 beach holiday vacation summer
⛰ mountain hiking outdoors
🏃 running exercise fitness sport jog
🏋 weights gym fitness workout
⚽ football soccer sport
🏀 basketball sport
🎾 tennis sport
🏊 swimming sport pool
🧘 yoga meditation calm mindfulness
💊 pill medicine health pharmacy
🩺 stethoscope doctor health medical
🏥 hospital health medical
🧴 lotion care
🛏 bed sleep rest
🧹 broom clean chores
🧺 laundry basket washing
🛠 repair diy fix
🐶 dog pet
🐱 cat pet
🌱 plant seedling grow garden
🌳 tree nature
🌸 flower blossom spring
☀ sun weather sunny
🌧 rain weather
❄ snow cold winter weather
🔥 fire hot streak habit trending
⭐ star favourite favorite
❤ heart love like favourite
🎁 gift present birthday
🎉 party celebration congrats
🎂 cake birthday
`,
    '🙂 Faces': `
🙂 smile happy face
😀 grin happy face
😄 happy laugh face
😎 cool sunglasses face
🤓 nerd geek face study
🤔 thinking hmm face question
😴 sleep tired face
🥳 party celebrate face
😍 love heart eyes face
🤯 mind blown face
😅 sweat smile relief face
🙏 thanks pray please hands
👍 thumbs up like good ok yes
👎 thumbs down dislike bad no
👏 clap applause bravo
🙌 praise hooray hands
👋 wave hello bye hand
✌ victory peace hand
🤝 handshake deal agree partner
💪 strong muscle power workout
👀 eyes look watch see
🧑 person user people profile
👥 people group team users
👤 user person profile account
👨‍👩‍👧 family
`,
    '🔣 Symbols': `
⭐ star favourite
🌟 glowing star
✨ sparkles new magic
⚡ lightning fast power energy
🔥 fire hot
💥 boom collision
🎖 medal award
🏆 trophy win award champion
🥇 gold first medal
🚩 flag red marker
🏁 finish flag race
⚑ flag
🔴 red circle
🟠 orange circle
🟡 yellow circle
🟢 green circle
🔵 blue circle
🟣 purple circle
⚫ black circle
⚪ white circle
🟥 red square
🟧 orange square
🟨 yellow square
🟩 green square
🟦 blue square
🟪 purple square
♻ recycle
✔ check tick yes
✘ cross no
❌ cross cancel delete no
⭕ circle
➡ arrow right next
⬅ arrow left back
⬆ arrow up
⬇ arrow down
🔄 refresh sync reload cycle
🔁 repeat loop
🔀 shuffle random
↩ return undo back
⚠ warning caution
🚫 prohibited forbidden no
ℹ info information
🆕 new
🆓 free
🔝 top
🔜 soon
💯 hundred perfect score
♾ infinity
©  copyright
`,
  };

  const CATS = Object.keys(DATA);
  const parsed = {};
  CATS.forEach((c) => {
    parsed[c] = DATA[c].trim().split('\n').map((l) => {
      const i = l.indexOf(' ');
      return { e: l.slice(0, i).trim(), k: l.slice(i + 1).toLowerCase() };
    }).filter((x) => x.e);
  });
  const ALL = [].concat(...CATS.map((c) => parsed[c]));

  // site/product names that are not emoji keywords, mapped to a keyword that is
  const ALIASES = {
    gmail: 'mail', outlook: 'mail', protonmail: 'mail', calendar: 'calendar', gcal: 'calendar', github: 'github', gitlab: 'github', stackoverflow: 'code',
    drive: 'folder', dropbox: 'cloud', onedrive: 'cloud', icloud: 'cloud', docs: 'document', word: 'document', excel: 'spreadsheet', sheets: 'spreadsheet',
    notion: 'notes', obsidian: 'notes', evernote: 'notes', youtube: 'youtube', netflix: 'movie', spotify: 'music', soundcloud: 'music', podcast: 'podcast',
    scholar: 'scholar', arxiv: 'research', pubmed: 'science', jstor: 'library', library: 'library', catalogue: 'library', catalog: 'library', hku: 'library',
    hkmu: 'library', lancaster: 'library', university: 'university', moodle: 'study', blackboard: 'study', canvas: 'study', zoom: 'video', teams: 'chat',
    slack: 'slack', whatsapp: 'whatsapp', telegram: 'chat', wechat: 'chat', messenger: 'chat', facebook: 'people', twitter: 'chat', instagram: 'photo',
    linkedin: 'work', reddit: 'chat', amazon: 'amazon', taobao: 'shopping', paypal: 'payment', bank: 'bank', hsbc: 'bank', maps: 'maps', map: 'map',
    translate: 'language', deepl: 'language', chatgpt: 'chatgpt', claude: 'claude', openai: 'ai', gemini: 'ai', weather: 'weather', news: 'news', bbc: 'news',
    wikipedia: 'book', todo: 'task', tasks: 'task', trello: 'tasks', jira: 'tasks', figma: 'design', canva: 'design', photos: 'photo', flights: 'flight', hotel: 'hotel',
  };

  function suggest(text) {
    const words = (text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
    for (const w of words) {
      const kw = ALIASES[w] || w;
      const hit = ALL.find((x) => x.k.split(' ').includes(kw));
      if (hit) return hit.e;
    }
    for (const w of words) {
      const hit = ALL.find((x) => x.k.split(' ').some((k) => k.startsWith(w) && w.length > 2));
      if (hit) return hit.e;
    }
    return '';
  }

  HB.emoji = {
    suggest,
    /** Open the picker at screen position; onPick(emoji). */
    open(x, y, onPick) {
      let cat = CATS[0];
      const grid = h('div', { class: 'emoji-grid' });
      const tabs = h('div', { class: 'emoji-tabs' });
      const input = h('input', { type: 'text', class: 'emoji-search', placeholder: 'Search: mail, book, music, code…', autocomplete: 'off' });
      const pop = h('div', { class: 'emoji-pop' }, input, tabs, grid);
      const draw = () => {
        const q = input.value.trim().toLowerCase();
        const list = q ? ALL.filter((x, i) => x.k.includes(q) && ALL.findIndex((y) => y.e === x.e) === i) : parsed[cat];
        grid.replaceChildren(...(list.length ? list : []).map((x) => h('button', {
          type: 'button', class: 'emoji-btn', text: x.e, title: x.k.split(' ').slice(0, 3).join(', '),
          onclick: () => { HB.ui.closeMenus(); onPick(x.e); },
        })));
        if (!list.length) grid.append(h('div', { class: 'muted small', text: 'No match. You can also paste any emoji into the box.' }));
        HB.$$('.emoji-tab', tabs).forEach((t) => t.classList.toggle('on', !q && t.dataset.cat === cat));
      };
      CATS.forEach((c) => tabs.append(h('button', { type: 'button', class: 'emoji-tab', dataset: { cat: c }, title: c.slice(c.indexOf(' ') + 1), text: Array.from(c)[0],
        onclick: () => { cat = c; input.value = ''; draw(); } })));
      input.addEventListener('input', draw);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const f = HB.$('.emoji-btn', grid); if (f) f.click(); }
      });
      HB.ui.popover(pop, x, y);
      draw();
      input.focus();
    },
  };
})();
