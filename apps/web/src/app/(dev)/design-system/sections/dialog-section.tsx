'use client';

import { useState } from 'react';

import { Button, Dialog } from '@/components/ui';

import { SectionShell } from './section-shell';

export function DialogSection() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <SectionShell title="Dialog" vrId="dialog">
      <div className="flex flex-wrap gap-md">
        <Button variant="primary" onClick={() => setConfirmOpen(true)}>
          Open confirmation
        </Button>
        <Button variant="secondary" onClick={() => setDetailOpen(true)}>
          Open detail
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Submit for correction?"
        footer={
          <>
            <Button variant="neutral" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setConfirmOpen(false)}>
              Submit
            </Button>
          </>
        }
      >
        <p className="text-body-md text-on-surface">
          Your text will be corrected with your Gemini key. Once submitted, it can’t be edited or undone.
        </p>
      </Dialog>

      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} title="Third conditional">
        <p className="text-body-md text-on-surface">
          The if-clause of a third conditional takes the past perfect, not &ldquo;would have&rdquo;.
        </p>
      </Dialog>
    </SectionShell>
  );
}
