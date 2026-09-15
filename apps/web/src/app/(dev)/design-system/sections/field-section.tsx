'use client';

import { useState } from 'react';

import { Field, fieldControlClassName } from '@/components/ui';

import { SectionShell } from './section-shell';

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
              className={fieldControlClassName}
            />
          )}
        </Field>
        <Field label="With a hint" hint="This is optional guidance text.">
          {(props) => <input {...props} type="text" className={fieldControlClassName} />}
        </Field>
        <Field label="With an error" error="This field is required.">
          {(props) => <input {...props} type="text" className={fieldControlClassName} />}
        </Field>
      </div>
    </SectionShell>
  );
}
