import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/index';
import LegalLayout from './LegalLayout';

export default function TermsPage() {
  const { t } = useTranslation();
  const it = i18n.language?.startsWith('it');

  return (
    <LegalLayout title={t('legal.terms')}>
      {it ? (
        <>
          <p>
            Taxtoo è un&apos;applicazione web client-only che aiuta a calcolare l&apos;IMU e a
            generare il modello F24, con assistenza AI. Il servizio è fornito &quot;così com&apos;è&quot;
            per uso personale e non sostituisce la consulenza di un commercialista.
          </p>
          <p>
            <b>Autenticazione.</b> Accedi con il tuo account Google o Microsoft. Non memorizziamo le
            tue credenziali. I token vengono usati solo per salvare file nel tuo cloud personale.
          </p>
          <p>
            <b>Archiviazione dati.</b> Documenti, estrazioni, calcoli, F24 e impostazioni sono
            salvati esclusivamente nel tuo Google Drive o OneDrive. Non abbiamo accesso ai tuoi file.
          </p>
          <p>
            <b>Servizi di terze parti.</b> L&apos;elaborazione AI avviene tramite l&apos;endpoint
            Azure OpenAI / Document Intelligence che configuri tu. La tua API key è salvata nel tuo
            Drive, non sui nostri server.
          </p>
          <p>
            <b>Esclusione di responsabilità.</b> Il servizio è fornito senza garanzie. Non siamo
            responsabili dell&apos;accuratezza dei calcoli, della perdita di dati o di interruzioni.
            Verifica sempre i dati prima di effettuare un pagamento.
          </p>
        </>
      ) : (
        <>
          <p>
            Taxtoo is a client-only web application that helps you compute the Italian IMU tax and
            generate the F24 form with AI assistance. The service is provided &quot;as-is&quot; for
            personal use and is not a substitute for professional fiscal advice.
          </p>
          <p>
            <b>Authentication.</b> You sign in with your Google or Microsoft account. We do not store
            your credentials. Tokens are used only to save files to your personal cloud storage.
          </p>
          <p>
            <b>Data storage.</b> Documents, extractions, calculations, F24 files and settings are
            stored exclusively in your own Google Drive or OneDrive. We have no access to your files.
          </p>
          <p>
            <b>Third-party services.</b> AI processing happens via the Azure OpenAI / Document
            Intelligence endpoint you configure. Your API key is stored in your Drive, not on our
            servers.
          </p>
          <p>
            <b>Disclaimer.</b> The service is provided without warranty. We are not liable for
            calculation accuracy, data loss, or service interruptions. Always verify the data before
            making a payment.
          </p>
        </>
      )}
    </LegalLayout>
  );
}
