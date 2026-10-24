'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formOf, PET_STATES, visitLayout, xpBar, type PetState, type Visit } from '@/lib/marketing/space'
import LobbyTile, { type LobbyEntry } from './LobbyTile'
import NotesTile from './NotesTile'
import PetNode from './PetNode'
import PetTile from './PetTile'
import PhotoTile from './PhotoTile'
import RoomTile from './RoomTile'
import SpaceBoard, { type BoardTile } from './SpaceBoard'
import SpaceCover from './SpaceCover'
import TrophiesTile from './TrophiesTile'
import s from './myspace.module.css'

// A visit to a teammate's space (`My Space Bento.dc.html` › visiting, ⑦-4 — the user's answers 37, 38 and 40): *👀
// You're visiting Mei's space* with *← Back to mine*, their cover, avatar (the one uploaded on My Space), name, role,
// status and pet — in their own look — and the visit's board: their room with the pet in it, the pet's tile, the
// trophies, their Notes and their Photo, the lobby. Nothing on it is the visitor's to change. *💬 Message* and *👋 Wave*
// come with the chat (⑦-3).

export interface VisitSpaceProps {
  visit: Visit
  /** How their pet feels: their plate and its energy (the page reckons it). */
  state: PetState
  letter: string
  avatarBg: string
  lobby: LobbyEntry[]
  /** The visitor's staff id, if they have one. */
  me: string | null
}

const nothing = () => {}

export default function VisitSpace({ visit, state, letter, avatarBg, lobby, me }: VisitSpaceProps) {
  const router = useRouter()
  const sp = visit.space
  const level = visit.stats ? xpBar(visit.stats.xp).level : 1
  const pet = sp.pet.onboarded ? { species: sp.pet.species, level, form: formOf(level), img: sp.petPath, state, color: sp.pet.color } : null
  const petName = sp.pet.name || 'Pet'
  const layout = visitLayout(!!sp.photoPath)
  const room = layout.find(t => t.id === 'room')
  const tiles: Partial<Record<string, BoardTile>> = {
    room: room ? {
      bare: true,
      body: (
        <RoomTile room={sp.room} place={room} pet={pet} label={`${visit.first}'s room`} canDecorate={false} decorating={false} selected={null}
          onSelect={nothing} onMovePiece={nothing} onPieceDropped={nothing} onDecorate={nothing} />
      ),
    } : undefined,
    pet: { body: <PetTile pet={pet} name={petName} stats={pet ? visit.stats : null} canCare={false} caring={false} onFeed={nothing} onExercise={nothing} /> },
    trophies: { body: <TrophiesTile stats={visit.stats} /> },
    notes: { bare: true, body: <NotesTile text={sp.notes} canEdit={false} placeholder="No notes yet" onChange={nothing} onDone={nothing} /> },
    photo: sp.photoPath ? { bare: true, body: <PhotoTile path={sp.photoPath} canEdit={false} sending={null} onPick={nothing} /> } : undefined,
    lobby: {
      bare: true,
      body: <LobbyTile pets={lobby} me={me} home={false} onVisit={staff => router.push(staff === me ? '/marketing' : `/marketing?visit=${staff}`)} />,
    },
  }
  const role = visit.role || visit.title
  return (
    <div className={s.page} data-bg={sp.theme.bg} data-accent={sp.theme.accent} data-corners={sp.theme.corners}>
      <div className={s.frame}>
        <div className={s.space}>
          <div className={s.visitBar}>
            <span>👀 You&apos;re visiting {visit.first}&apos;s space</span>
            <span className={s.grow} />
            <Link href="/marketing" className={s.visitBack}>← Back to mine</Link>
          </div>
          <SpaceCover cover={sp.cover} coverPath={sp.coverPath} avatarPath={sp.avatarPath} letter={letter} avatarBg={avatarBg} canEdit={false}
            sending={null} popOpen={false} onPop={nothing} onPreset={nothing} onPick={nothing}
            pet={pet ? <PetNode species={pet.species} form={pet.form} img={pet.img} size={44} state={pet.state} color={pet.color} /> : null} />
          <div className={s.who}>
            <div className={s.whoMain}>
              <div className={s.name}>
                {visit.full || visit.first} {role ? <span className={s.role}>· {role}</span> : null}
              </div>
              <div className={s.statusLine}>
                {sp.status ? <span>“{sp.status}”</span> : null}
                {pet ? <span className={s.petLine}>· {petName} Lv {level} · {PET_STATES[state].bubble || '🙂'} {PET_STATES[state].label}</span> : null}
              </div>
            </div>
          </div>
          <div className={s.boardPad}>
            <SpaceBoard layout={layout} tiles={tiles} editing={false} onMove={nothing} onPlace={nothing} onRemove={nothing} />
          </div>
        </div>
      </div>
    </div>
  )
}
