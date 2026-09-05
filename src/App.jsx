import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import {
  ArrowRightLeft,
  ShieldCheck,
  Clock,
  Binary,
  Phone,
  Radio,
  Type,
  AlignLeft,
  KeyRound,
  Hash,
  Lock,
  CalendarClock,
  Hourglass,
  Mail,
  FileJson,
  Code,
  Braces,
  Table,
  FileText,
  GitCompare,
  Network
} from 'lucide-react';

import { Sidebar, Header } from './layouts';
import {
  DebeziumDiff,
  JwtDebugger,
  EpochConverter,
  TimeDurationCalculator,
  NumberConverter,
  T9Converter,
  MorseConverter,
  StringTools,
  TextAnalyzer,
  PasswordGenerator,
  HashGenerator,
  BasicAuthGenerator,
  CrontabGenerator,
  SmtpChecker,
  SubnetCalculator,
  JsonToEnv,
  JsonBeautifier,
  CodeTools,
  JsonKeyDiff,
  DataTablePreview,
  MarkdownViewer,
  TextDiff
} from './features';

const MENU_GROUPS = [
  {
    label: 'Development',
    items: [
      { id: 'debezium', label: 'Debezium Diff', icon: ArrowRightLeft, keywords: ['debezium', 'event', 'kafka', 'cdc', 'compare', 'database'] },
      { id: 'jsonkeydiff', label: 'JSON Key Diff', icon: FileJson, keywords: ['json', 'key', 'diff', 'compare', 'object', 'keys'] },
      { id: 'json2env', label: 'JSON to .env', icon: FileJson, keywords: ['json', 'env', 'convert', 'parse', 'environment', 'variable'] },
      { id: 'env2json', label: '.env to JSON', icon: FileJson, keywords: ['env', 'json', 'convert', 'parse', 'environment', 'variable'] },
      { id: 'smtp', label: 'SMTP Checker', icon: Mail, keywords: ['smtp', 'email', 'mail', 'check', 'test', 'connection'] },
    ]
  },
  {
    label: 'Formatting',
    items: [
      { id: 'jsonbeautifier', label: 'JSON Beautifier', icon: Braces, keywords: ['json', 'format', 'pretty', 'beautify', 'indent', 'validate'] },
      { id: 'markdown', label: 'Markdown Viewer', icon: FileText, keywords: ['markdown', 'md', 'viewer', 'editor', 'preview', 'mermaid', 'gfm'] },
      { id: 'codetools-js', label: 'JS Beautifier/Minifier', icon: Code, keywords: ['javascript', 'js', 'format', 'minify', 'beautify', 'compress'] },
      { id: 'codetools-css', label: 'CSS Beautifier/Minifier', icon: Code, keywords: ['css', 'format', 'minify', 'beautify', 'compress', 'style'] },
      { id: 'codetools-html', label: 'HTML Beautifier/Minifier', icon: Code, keywords: ['html', 'format', 'minify', 'beautify', 'compress', 'markup'] },
      { id: 'codetools-yaml', label: 'YAML Beautifier/Minifier', icon: Code, keywords: ['yaml', 'yml', 'format', 'minify', 'beautify', 'compress'] },
    ]
  },
  {
    label: 'Security',
    items: [
      { id: 'jwt', label: 'JWT Debugger', icon: ShieldCheck, keywords: ['jwt', 'token', 'decode', 'encode', 'debug', 'json web token'] },
      { id: 'password', label: 'Password Gen', icon: Lock, keywords: ['password', 'generate', 'random', 'security', 'pass', 'strength'] },
      { id: 'hash', label: 'Hash Generator', icon: Hash, keywords: ['hash', 'md5', 'sha1', 'sha256', 'sha512', 'encode', 'digest'] },
      { id: 'basicauth', label: 'Basic Auth', icon: KeyRound, keywords: ['basic', 'auth', 'encode', 'decode', 'base64', 'header'] },
    ]
  },
  {
    label: 'Utilities',
    items: [
      { id: 'epoch', label: 'Epoch Converter', icon: Clock, keywords: ['epoch', 'timestamp', 'date', 'datetime', 'time', 'unix', 'milliseconds'] },
      { id: 'duration', label: 'Time Duration', icon: Hourglass, keywords: ['duration', 'time', 'elapsed', 'since', 'between', 'age', 'countdown', 'difference', 'how long'] },
      { id: 'number', label: 'Number Converter', icon: Binary, keywords: ['number', 'hex', 'decimal', 'binary', 'octal', 'convert'] },
      { id: 't9', label: 'T9 Decoder', icon: Phone, keywords: ['t9', 'phone', 'keypad', 'sms', 'multi-tap', 'mobile', 'decode'] },
      { id: 'morse', label: 'Morse Code', icon: Radio, keywords: ['morse', 'code', 'signal', 'radio', 'telegraph', 'dit', 'dah', 'dot', 'dash', 'cw', 'continuous wave', 'encode', 'decode'] },
      { id: 'string', label: 'Base64 / URL', icon: Type, keywords: ['base64', 'url', 'encode', 'decode', 'string', 'text'] },
      { id: 'textanalyzer', label: 'Text Analyzer', icon: AlignLeft, keywords: ['text', 'analyze', 'count', 'words', 'characters', 'lines', 'length'] },
      { id: 'textdiff', label: 'Text Diff', icon: GitCompare, keywords: ['text', 'diff', 'compare', 'line', 'word', 'unified', 'side-by-side'] },
      { id: 'crontab', label: 'Crontab Gen', icon: CalendarClock, keywords: ['cron', 'crontab', 'schedule', 'time', 'generator', 'timer'] },
      { id: 'datatable', label: 'Data Table View', icon: Table, keywords: ['csv', 'tsv', 'table', 'data', 'preview', 'excel', 'spreadsheet'] },
      { id: 'subnet', label: 'Subnet Calc', icon: Network, keywords: ['subnet', 'cidr', 'ipv4', 'network', 'mask', 'subnetting', 'split', 'devops', 'address', 'broadcast'] },
    ]
  }
];

const NAV_ITEMS = MENU_GROUPS.flatMap(group => group.items);

const CODE_TOOL_ROUTES = {
  javascript: '/codetools-js',
  css: '/codetools-css',
  html: '/codetools-html',
  yaml: '/codetools-yaml',
};

const FEATURE_COMPONENTS = {
  debezium: DebeziumDiff,
  jwt: JwtDebugger,
  epoch: EpochConverter,
  duration: TimeDurationCalculator,
  number: NumberConverter,
  t9: T9Converter,
  morse: MorseConverter,
  string: StringTools,
  textanalyzer: TextAnalyzer,
  password: PasswordGenerator,
  hash: HashGenerator,
  basicauth: BasicAuthGenerator,
  crontab: CrontabGenerator,
  smtp: SmtpChecker,
  json2env: () => <JsonToEnv initialMode="json2env" />,
  env2json: () => <JsonToEnv initialMode="env2json" />,
  jsonbeautifier: JsonBeautifier,
  markdown: MarkdownViewer,
  jsonkeydiff: JsonKeyDiff,
  textdiff: TextDiff,
  datatable: DataTablePreview,
  subnet: SubnetCalculator,
  'codetools-js': () => <CodeTools initialLanguage="javascript" languageRoutes={CODE_TOOL_ROUTES} />,
  'codetools-css': () => <CodeTools initialLanguage="css" languageRoutes={CODE_TOOL_ROUTES} />,
  'codetools-html': () => <CodeTools initialLanguage="html" languageRoutes={CODE_TOOL_ROUTES} />,
  'codetools-yaml': () => <CodeTools initialLanguage="yaml" languageRoutes={CODE_TOOL_ROUTES} />,
};

const App = () => {
  const location = useLocation();
  const currentId = location.pathname.substring(1) || 'debezium';
  const activeNavItem = NAV_ITEMS.find(i => i.id === currentId) || NAV_ITEMS[0];

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      <Sidebar menuGroups={MENU_GROUPS} />

      <div className="flex-1 flex flex-col overflow-hidden w-full">
        <Header title={activeNavItem?.label} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 relative">
          <div className="h-full w-full max-w-6xl mx-auto">
            <Routes>
              <Route path="/" element={<Navigate to="/debezium" replace />} />

              {NAV_ITEMS.map(item => {
                const Component = FEATURE_COMPONENTS[item.id];
                return (
                  <Route
                    key={item.id}
                    path={`/${item.id}`}
                    element={<Component />}
                  />
                );
              })}

              <Route path="*" element={<Navigate to="/debezium" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
