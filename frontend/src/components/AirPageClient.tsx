'use client';

import AirInputForm from '@/components/AirInputForm';
import AirResults from '@/components/AirResults';
import { PipelineModePage } from '@/components/cockpit/PipelineModePage';

export default function AirPageClient() {
  return (
    <PipelineModePage mode="air" form={<AirInputForm />} results={<AirResults />} />
  );
}
