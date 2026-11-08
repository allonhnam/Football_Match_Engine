'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppProvider';
import { Report } from '@/components/Report';

export default function ReportPage() {
  const app = useApp();
  const router = useRouter();
  useEffect(() => { if (!app.report) router.replace('/'); }, [app.report, router]);
  if (!app.report) return null;
  return <Report report={app.report} onReplay={() => app.replay(app.report.config, app.report.commands)} onBack={app.endMatch} />;
}
