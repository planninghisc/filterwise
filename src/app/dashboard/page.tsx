import DashboardClient from './DashboardClient';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">거시경제/시장 지표 AI 대시보드</h1>
        <DashboardClient />
      </div>
    </div>
  );
}