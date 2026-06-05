'use client';

import RoadInputForm from '@/components/roadInputForm';
import RouteResults from '@/components/RouteResults';
import { PipelineModePage } from '@/components/cockpit/PipelineModePage';

export default function RoadPage() {
  return (
    <PipelineModePage
      mode="road"
      form={<RoadInputForm />}
      results={<RouteResults />}
    />
  );
}
