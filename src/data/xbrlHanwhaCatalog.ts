import catalogJson from './xbrlHanwhaCatalog.json'

export type XbrlCatalogLine = {
  sj: 'CIS' | 'BS'
  label: string
  id: string
  type: string | null
  qname_cfs: string | null
  qname_ofs: string | null
}

export const XBRL_HANWHA_CATALOG = catalogJson as { cis: XbrlCatalogLine[]; bs: XbrlCatalogLine[] }

export function allCatalogLines(): XbrlCatalogLine[] {
  return [...XBRL_HANWHA_CATALOG.cis, ...XBRL_HANWHA_CATALOG.bs]
}

export function lineKey(line: XbrlCatalogLine): string {
  return `${line.sj}:${line.id}`
}
