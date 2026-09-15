'use client';

import { useState } from 'react';

import { Field } from '@/components/ui';

import { SectionShell } from './section-shell';

const INPUT_CLASSES =
  'rounded-md border-2 border-outline-strong bg-surface-container-lowest px-md py-sm text-body-md';

export function FieldSection() {
  const [value, setValue] = useState('');

  return (
    <SectionShell title="Field" vrId="field">
      <div className="grid grid-cols-1 gap-md md:grid-cols-3">
        <Field label="Email">
          {(props) => (
            <input
              {...props}
              type="email"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className={INPUT_CLASSES}
            />
          )}
        </Field>
        <Field label="With a hint" hint="This is optional guidance text.">
          {(props) => <input {...props} type="text" className={INPUT_CLASSES} />}
        </Field>
        <Field label="With an error" error="This field is required.">
          {(props) => <input {...props} type="text" className={INPUT_CLASSES} />}
        </Field>
      </div>
    </SectionShell>
  );
}
