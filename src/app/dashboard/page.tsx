import DashboardClient from './DashboardClient';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[var(--fw-bg)] p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-[#c2410c] md:text-3xl">거시경제/시장 지표 AI 대시보드</h1>
        <DashboardClient />
      </div>
    </div>
  );
}