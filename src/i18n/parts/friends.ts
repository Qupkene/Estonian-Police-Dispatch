import type { Dict } from '../index';

// Sõbrad (2.40.0, docs/MULTIPLAYER.md section 18): the friends panel, the invitation to a room, a challenge sent to a
// friend, the notice in the menu.
export default {
  'friends.title': { et: 'Sõbrad', en: 'Friends' },
  'friends.inviteTitle': { et: 'Kutsu sõpru', en: 'Invite friends' },
  'friends.onlineN': { et: '{n} võrgus', en: '{n} online' },
  'friends.online': { et: 'Võrgus', en: 'Online' },
  'friends.offline': { et: 'Võrgust väljas', en: 'Offline' },
  'friends.what.menu': { et: 'Menüüs', en: 'In the menu' },
  'friends.what.shift': { et: 'Vahetuses', en: 'On shift' },
  'friends.what.room': { et: 'Mitmikmängu ruumis', en: 'In a multiplayer room' },
  'friends.what.lobby': { et: 'Ruumis {code} · {n}/{max}', en: 'In room {code} · {n}/{max}' },
  'friends.what.roomShift': { et: 'Ruumi vahetuses · {mode}', en: 'On a room shift · {mode}' },

  'friends.add.label': { et: 'Lisa sõber', en: 'Add a friend' },
  'friends.add.placeholder': { et: 'Kasutajanimi', en: 'User name' },
  'friends.add.go': { et: 'Lisa', en: 'Add' },
  'friends.add.hint': {
    et: 'Kirjuta sõbra kasutajanimi. Kui ta kutse vastu võtab, näete teineteist võrgus.',
    en: 'Type your friend’s user name. Once they accept, you see each other online.',
  },
  'friends.add.asked': { et: 'Sõbrakutse saadetud: {name}', en: 'Friend request sent to {name}' },
  'friends.add.friends': { et: '{name} on nüüd sinu sõber.', en: '{name} is now your friend.' },

  'friends.invites': { et: 'Kutsed', en: 'Invitations' },
  'friends.asking': { et: 'Sõbrakutsed', en: 'Friend requests' },
  'friends.list': { et: 'Sõbrad', en: 'Friends' },
  'friends.asked': { et: 'Ootavad vastust', en: 'Waiting for an answer' },
  'friends.askedNote': { et: 'Kutse saadetud', en: 'Request sent' },
  'friends.takeBack': { et: 'Võta tagasi', en: 'Take back' },
  'friends.accept': { et: 'Võta vastu', en: 'Accept' },
  'friends.decline': { et: 'Keeldu', en: 'Decline' },
  'friends.join': { et: 'Liitu', en: 'Join' },
  'friends.joinAria': { et: 'Liitu ruumiga, kus on {name}', en: 'Join the room {name} is in' },
  'friends.invite': { et: 'Kutsu', en: 'Invite' },
  'friends.inviteAria': { et: 'Kutsu ruumi: {name}', en: 'Invite {name} to the room' },
  'friends.invited': { et: 'Kutsutud', en: 'Invited' },
  'friends.inRoom': { et: 'Ruumis', en: 'In the room' },
  'friends.inviteHint': {
    et: 'Kutse jõuab sõbra menüüsse ja kehtib 30 minutit. Võrgust väljas sõber näeb seda, kui tuleb tagasi.',
    en: 'The invitation reaches your friend’s menu and holds for 30 minutes. A friend who is offline sees it when they come back.',
  },
  'friends.empty': {
    et: 'Sul ei ole veel sõpru. Lisa keegi tema kasutajanime järgi.',
    en: 'No friends yet. Add someone by their user name.',
  },
  'friends.remove': { et: 'Eemalda sõber', en: 'Remove friend' },
  'friends.removeAria': { et: 'Eemalda sõber: {name}', en: 'Remove {name} from friends' },
  'friends.remove.confirm': {
    et: 'Kas eemaldad mängija {name} sõprade seast? Ta ei näe enam, kas oled võrgus.',
    en: 'Remove {name} from your friends? They will no longer see when you are online.',
  },
  'friends.remove.no': { et: 'Jäta', en: 'Keep' },
  'friends.remove.yes': { et: 'Eemalda', en: 'Remove' },

  'friends.inv.room': { et: '{name} kutsub sind oma ruumi', en: '{name} invites you to their room' },
  'friends.inv.challenge': { et: '{name} saatis sulle väljakutse', en: '{name} sent you a challenge' },
  'friends.inv.roomLine': {
    et: '{mode} · {region} · {n}/{max} mängijat',
    en: '{mode} · {region} · {n}/{max} players',
  },
  'friends.inv.challengeLine': { et: '{region} · {score} punkti', en: '{region} · {score} points' },
  'friends.inv.challengeLineNoScore': { et: '{region} prefektuuri vahetus', en: '{region} prefecture shift' },
  'friends.inv.view': { et: 'Vaata', en: 'View' },
  'friends.inv.decline': { et: 'Loobu kutsest', en: 'Decline the invitation' },

  'friends.pick.title': { et: 'Saada sõbrale', en: 'Send to a friend' },
  'friends.pick.empty': {
    et: 'Sõpru saad lisada mitmikmängu menüüs.',
    en: 'Add friends in the multiplayer menu.',
  },
  'friends.pick.send': { et: 'Saada', en: 'Send' },
  'friends.pick.sendAria': { et: 'Saada väljakutse: {name}', en: 'Send the challenge to {name}' },
  'friends.pick.sent': { et: 'Saadetud', en: 'Sent' },

  'friends.notice.room': { et: 'Kutse ruumi', en: 'Room invitation' },
  'friends.notice.challenge': { et: 'Väljakutse', en: 'Challenge' },
  'friends.notice.ask': { et: 'Sõbrakutse', en: 'Friend request' },
  'friends.notice.askText': {
    et: '{name} soovib sinuga sõbraks saada',
    en: '{name} wants to be your friend',
  },
  'friends.notice.join': { et: 'Liitu ruumiga', en: 'Join the room' },
  'friends.notice.later': { et: 'Hiljem', en: 'Later' },
  'friends.notice.more': { et: '+{n} veel', en: '+{n} more' },

  'friends.menu.online.one': { et: '1 sõber võrgus', en: '1 friend online' },
  'friends.menu.online': { et: '{n} sõpra võrgus', en: '{n} friends online' },
  'friends.menu.waiting.one': { et: '1 kutse ootab', en: '1 invitation waiting' },
  'friends.menu.waiting': { et: '{n} kutset ootab', en: '{n} invitations waiting' },

  'friends.err.friend_not_found': {
    et: 'Sellise kasutajanimega mängijat ei ole.',
    en: 'There is no player with that user name.',
  },
  'friends.err.friend_self': { et: 'Iseennast ei saa sõbraks lisada.', en: 'You cannot add yourself.' },
  'friends.err.friends_full': {
    et: 'Sõprade nimekiri on täis (100).',
    en: 'The friends list is full (100).',
  },
  'friends.err.request_not_found': {
    et: 'Seda sõbrakutset enam ei ole.',
    en: 'That friend request is gone.',
  },
  'friends.err.rate_limited': {
    et: 'Liiga palju kutseid korraga, proovi hiljem uuesti.',
    en: 'Too many requests at once, try again later.',
  },
  'friends.err.room_not_found': { et: 'Seda ruumi enam ei ole.', en: 'That room is gone.' },
  'friends.err.room_started': {
    et: 'Selle ruumi vahetus on juba alanud.',
    en: 'That room’s shift has already started.',
  },
  'friends.err.challenge_not_found': { et: 'Seda väljakutset enam ei ole.', en: 'That challenge is gone.' },
  'friends.err.auth_required': { et: 'Selleks logi kontoga sisse.', en: 'Sign in to an account for this.' },
  'friends.err.network': {
    et: 'Server ei vasta, proovi uuesti.',
    en: 'The server does not answer, try again.',
  },
  'friends.err.timeout': {
    et: 'Server ei vasta, proovi uuesti.',
    en: 'The server does not answer, try again.',
  },
  'friends.err.other': { et: 'Midagi läks valesti, proovi uuesti.', en: 'Something went wrong, try again.' },
} satisfies Dict;
