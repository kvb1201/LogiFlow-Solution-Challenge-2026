'use client';

import WaterInputForm from '@/components/waterInputForm';
import WaterRouteResults from '@/components/WaterRouteResults';
import { PipelineModePage } from '@/components/cockpit/PipelineModePage';

export default function WaterPage() {
  return (
    <PipelineModePage
      mode="water"
      form={<WaterInputForm />}
      results={<WaterRouteResults />}
    />
  );
}
