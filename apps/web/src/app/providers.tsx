'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { BigTextHost } from '@/components/ui/BigTextHost';
import { MessageBoxProvider } from '@/components/ui/MessageBox';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ImageViewerHost } from '@/features/master/ImageViewer';
import { PrintHost } from '@/features/print/PrintHost';
import { ReportHost } from '@/features/report/ReportHost';
import { WorkLogHost } from '@/features/work-log/WorkLogHost';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <MessageBoxProvider>
        <AuthProvider>
          <WorkLogHost>
            <PrintHost>
              <ReportHost>
                <BigTextHost>
                  <ImageViewerHost>{children}</ImageViewerHost>
                </BigTextHost>
              </ReportHost>
            </PrintHost>
          </WorkLogHost>
        </AuthProvider>
      </MessageBoxProvider>
    </QueryClientProvider>
  );
}
