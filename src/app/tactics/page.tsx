'use client';
import { useApp } from '@/components/AppProvider';
import { TacticsBoard } from '@/components/TacticsBoard';

export default function TacticsPage() {
  const app = useApp();
  return <TacticsBoard teams={app.teams} setTeams={app.setTeams} side={app.boardSide} setSide={app.setBoardSide} />;
}
