import { useState } from 'react';
import { useSnackbar } from 'notistack';
import { careerApi } from '../../api/endpoints';

/**
 * Opens or downloads an applicant's résumé.
 *
 * The file lives behind admin auth, so a plain <a href> cannot fetch it — the bytes
 * come back through the axios client and are handed to the browser as an object URL.
 * `busyId` lets the calling row disable its buttons while a fetch is in flight.
 */
export default function useResume() {
  const { enqueueSnackbar } = useSnackbar();
  const [busyId, setBusyId] = useState(null);

  const run = async (application, mode) => {
    const id = application?._id;
    if (!id) return;

    setBusyId(id);
    try {
      const blob = await careerApi.resume(id, mode === 'download' ? 'attachment' : 'inline');
      const url = URL.createObjectURL(blob);

      if (mode === 'download') {
        const link = document.createElement('a');
        link.href = url;
        link.download = application.resume?.fileName || `${application.name}-resume.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else if (!window.open(url, '_blank', 'noopener')) {
        enqueueSnackbar('Allow pop-ups to preview résumés, or use Download instead', {
          variant: 'warning',
        });
      }

      // Revoking immediately would cancel the download the browser has just started.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not open the résumé', { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return {
    busyId,
    view: (application) => run(application, 'view'),
    download: (application) => run(application, 'download'),
  };
}
