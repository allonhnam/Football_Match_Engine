'use client';
import { useApp } from '@/components/AppProvider';
import { Setup } from '@/components/Setup';
import { LiveMatch } from '@/components/LiveMatch';

// The matchday page: match setup, or the live match once one is running.
export default function MatchdayPage() {
  const app = useApp();
  if (app.session) {
    return (
      <LiveMatch
        key={app.session.key}
        session={app.session}
        control={app.session.mode === 'replay' ? 'none' : app.session.config.control}
        settings={app.settings}
        onFinished={app.onFinished}
        onNewMatch={app.endMatch}
      />
    );
  }
  return (
    <Setup
      teams={app.teams} setTeams={app.setTeams} seed={app.seed} setSeed={app.setSeed}
      venue={app.venue} setVenue={app.setVenue} control={app.control} setControl={app.setControl}
      competition={app.competition} setCompetition={app.setCompetition}
      onKickoff={app.kickoff} onSimulate={app.simulate} history={app.history}
      onReplay={(h: any) => app.replay(h.config, h.commands)} onEditTactics={app.editTactics}
    />
  );
}
