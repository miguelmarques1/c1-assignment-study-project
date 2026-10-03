'use client';

import { useState } from 'react';

import { TextArea } from '@/components/ui';

import { SectionShell } from './section-shell';

export function TextAreaSection() {
  const [value, setValue] = useState('A learner types here.');

  return (
    <SectionShell title="Text area" vrId="text-area">
      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <TextArea label="Feedback" hint="Tell us what went well." value={value} onChange={(event) => setValue(event.target.value)} />
        <TextArea label="With an error" error="This field is required." />
        <TextArea label="Disabled" defaultValue="Cannot be edited right now." disabled />
        <TextArea label="Read-only presentation" defaultValue="The submitted text, frozen." readOnlyPresentation />
      </div>
      <div className="h-64">
        <TextArea label="Fill" fill defaultValue="Grows to fill the height its container gives it." />
      </div>
    </SectionShell>
  );
}
