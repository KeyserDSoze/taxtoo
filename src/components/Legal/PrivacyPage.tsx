import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/index';
import LegalLayout from './LegalLayout';

export default function PrivacyPage() {
  const { t } = useTranslation();
  const it = i18n.language?.startsWith('it');

  return (
    <LegalLayout title={t('legal.privacy')}>
      {it ? (
        <>
          <p>
            <b>Cosa raccogliamo.</b> Solo nome ed email dal tuo provider OAuth (Google o Microsoft)
            per mostrare il tuo profilo. Nessun altro dato personale viene raccolto da noi.
          </p>
          <p>
            <b>Dove vivono i tuoi dati.</b> Tutti i tuoi dati (documenti fiscali, estrazioni,
            calcoli, F24, impostazioni) sono salvati nel tuo cloud (Google Drive o OneDrive). Non
            abbiamo archiviazione lato server.
          </p>
          <p>
            <b>Elaborazione AI.</b> I documenti vengono inviati all&apos;endpoint Azure che configuri
            tu, solo quando lo richiedi esplicitamente. Nessun training viene effettuato sui tuoi
            documenti.
          </p>
          <p>
            <b>Cookie e analytics.</b> Non usiamo cookie di tracciamento né analytics. Usiamo
            localStorage solo per tema, lingua e stato della sessione.
          </p>
          <p>
            <b>I tuoi diritti.</b> Puoi cancellare tutto in qualsiasi momento rimuovendo la cartella
            Taxtoo dal tuo cloud e revocando l&apos;accesso dell&apos;app dalle impostazioni del tuo
            account Google/Microsoft.
          </p>
        </>
      ) : (
        <>
          <p>
            <b>What we collect.</b> Only your name and email from your OAuth provider (Google or
            Microsoft) to display your profile. No other personal data is collected by us.
          </p>
          <p>
            <b>Where your data lives.</b> All your data (tax documents, extractions, calculations,
            F24 files, settings) is stored in your own cloud (Google Drive or OneDrive). We have no
            server-side storage.
          </p>
          <p>
            <b>AI processing.</b> Documents are sent to the Azure endpoint you configure, only when
            you explicitly request it. No training is performed on your documents.
          </p>
          <p>
            <b>Cookies & analytics.</b> We do not use tracking cookies or analytics. We use
            localStorage only for theme, language and session state.
          </p>
          <p>
            <b>Your rights.</b> You can delete everything at any time by removing the Taxtoo folder
            from your cloud and revoking the app&apos;s access in your Google/Microsoft account
            settings.
          </p>
        </>
      )}
    </LegalLayout>
  );
}
