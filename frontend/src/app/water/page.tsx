'use client';

import { Suspense } from 'react';
import WaterInputForm from '@/components/waterInputForm';
import WaterRouteResults from '@/components/WaterRouteResults';
import { PipelineModePage } from '@/components/cockpit/PipelineModePage';

export default function WaterPage() {
  return (
    <Suspense fallback={null}>
      <PipelineModePage
        mode="water"
        form={<WaterInputForm />}
        results={<WaterRouteResults />}
      />
    </Suspense>
  );
}
