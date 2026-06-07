import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ReportDetailPage } from '@/components/planner/ReportDetailPage';

export const metadata = {
  title: 'Plan Details — LogiFlow',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReportDetailRoute({ params }: Props) {
  const { id } = await params;
  return (
    <ProtectedRoute>
      <ReportDetailPage reportId={id} />
    </ProtectedRoute>
  );
}
