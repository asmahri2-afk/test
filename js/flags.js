// Full flag dictionary and getFlagCode function
if (!window.getFlagCode) {

window.getFlagCode = (function() {
    const mapping = {
        'ALBANIA': 'AL', 'ANDORRA': 'AD', 'AUSTRIA': 'AT', 'BELARUS': 'BY',
        'BELGIUM': 'BE', 'BOSNIA AND HERZEGOVINA': 'BA', 'BOSNIA & HERZEGOVINA': 'BA',
        'BULGARIA': 'BG', 'CROATIA': 'HR', 'CYPRUS': 'CY', 'CZECHIA': 'CZ',
        'CZECH REPUBLIC': 'CZ', 'DENMARK': 'DK', 'ESTONIA': 'EE', 'FAROE ISLANDS': 'FO',
        'FINLAND': 'FI', 'FRANCE': 'FR', 'GERMANY': 'DE', 'GIBRALTAR': 'GI',
        'GREECE': 'GR', 'GUERNSEY': 'GG', 'HUNGARY': 'HU', 'ICELAND': 'IS',
        'IRELAND': 'IE', 'ISLE OF MAN': 'IM', 'ITALY': 'IT', 'JERSEY': 'JE',
        'KOSOVO': 'XK', 'LATVIA': 'LV', 'LIECHTENSTEIN': 'LI', 'LITHUANIA': 'LT',
        'LUXEMBOURG': 'LU', 'MALTA': 'MT', 'MOLDOVA': 'MD', 'MONACO': 'MC',
        'MONTENEGRO': 'ME', 'NETHERLANDS': 'NL', 'NORTH MACEDONIA': 'MK',
        'NORWAY': 'NO', 'POLAND': 'PL', 'PORTUGAL': 'PT', 'ROMANIA': 'RO',
        'RUSSIA': 'RU', 'RUSSIAN FEDERATION': 'RU', 'SAN MARINO': 'SM',
        'SERBIA': 'RS', 'SLOVAKIA': 'SK', 'SLOVENIA': 'SI', 'SPAIN': 'ES',
        'SVALBARD': 'SJ', 'SWEDEN': 'SE', 'SWITZERLAND': 'CH', 'TURKEY': 'TR',
        'UKRAINE': 'UA', 'UNITED KINGDOM': 'GB', 'UK': 'GB', 'VATICAN': 'VA', 'HOLY SEE': 'VA',
        'ANTIGUA & BARBUDA': 'AG', 'ANTIGUA AND BARBUDA': 'AG', 'ARGENTINA': 'AR',
        'ARUBA': 'AW', 'BAHAMAS': 'BS', 'BARBADOS': 'BB', 'BELIZE': 'BZ',
        'BERMUDA': 'BM', 'BOLIVIA': 'BO', 'BRAZIL': 'BR', 'CANADA': 'CA',
        'CAYMAN ISLANDS': 'KY', 'CHILE': 'CL', 'COLOMBIA': 'CO', 'COSTA RICA': 'CR',
        'CUBA': 'CU', 'CURACAO': 'CW', 'DOMINICA': 'DM', 'DOMINICAN REPUBLIC': 'DO',
        'ECUADOR': 'EC', 'EL SALVADOR': 'SV', 'FALKLAND ISLANDS': 'FK',
        'FRENCH GUIANA': 'GF', 'GRENADA': 'GD', 'GUADELOUPE': 'GP',
        'GUATEMALA': 'GT', 'GUYANA': 'GY', 'HAITI': 'HT', 'HONDURAS': 'HN',
        'JAMAICA': 'JM', 'MARTINIQUE': 'MQ', 'MEXICO': 'MX', 'MONTSERRAT': 'MS',
        'NETHERLANDS ANTILLES': 'AN', 'NICARAGUA': 'NI', 'PANAMA': 'PA',
        'PARAGUAY': 'PY', 'PERU': 'PE', 'PUERTO RICO': 'PR',
        'SAINT KITTS AND NEVIS': 'KN', 'SAINT KITTS & NEVIS': 'KN',
        'SAINT LUCIA': 'LC', 'SAINT VINCENT': 'VC',
        'SAINT VINCENT AND THE GRENADINES': 'VC', 'SURINAME': 'SR',
        'TRINIDAD AND TOBAGO': 'TT', 'TRINIDAD & TOBAGO': 'TT',
        'TURKS AND CAICOS': 'TC', 'UNITED STATES': 'US', 'USA': 'US',
        'URUGUAY': 'UY', 'US VIRGIN ISLANDS': 'VI', 'VENEZUELA': 'VE',
        'ALGERIA': 'DZ', 'ANGOLA': 'AO', 'BENIN': 'BJ', 'BOTSWANA': 'BW',
        'BURKINA FASO': 'BF', 'BURUNDI': 'BI', 'CABO VERDE': 'CV', 'CAPE VERDE': 'CV',
        'CAMEROON': 'CM', 'CENTRAL AFRICAN REPUBLIC': 'CF', 'CHAD': 'TD',
        'COMOROS': 'KM', 'CONGO': 'CG', 'DEMOCRATIC REPUBLIC OF CONGO': 'CD',
        'DR CONGO': 'CD', 'DRC': 'CD', 'DJIBOUTI': 'DJ', 'EGYPT': 'EG',
        'EQUATORIAL GUINEA': 'GQ', 'ERITREA': 'ER', 'ESWATINI': 'SZ', 'SWAZILAND': 'SZ',
        'ETHIOPIA': 'ET', 'GABON': 'GA', 'GAMBIA': 'GM', 'GHANA': 'GH',
        'GUINEA': 'GN', 'GUINEA-BISSAU': 'GW', 'IVORY COAST': 'CI', "CÔTE D'IVOIRE": 'CI',
        "COTE D'IVOIRE": 'CI', 'KENYA': 'KE', 'LESOTHO': 'LS', 'LIBERIA': 'LR',
        'LIBYA': 'LY', 'MADAGASCAR': 'MG', 'MALAWI': 'MW', 'MALI': 'ML',
        'MAURITANIA': 'MR', 'MAURITIUS': 'MU', 'MAYOTTE': 'YT', 'MOROCCO': 'MA',
        'MOZAMBIQUE': 'MZ', 'NAMIBIA': 'NA', 'NIGER': 'NE', 'NIGERIA': 'NG',
        'REUNION': 'RE', 'RWANDA': 'RW', 'SAO TOME AND PRINCIPE': 'ST',
        'SENEGAL': 'SN', 'SEYCHELLES': 'SC', 'SIERRA LEONE': 'SL', 'SOMALIA': 'SO',
        'SOUTH AFRICA': 'ZA', 'SOUTH SUDAN': 'SS', 'SUDAN': 'SD',
        'TANZANIA': 'TZ', 'TOGO': 'TG', 'TUNISIA': 'TN', 'UGANDA': 'UG',
        'WESTERN SAHARA': 'EH', 'ZAMBIA': 'ZM', 'ZIMBABWE': 'ZW',
        'BAHRAIN': 'BH', 'IRAN': 'IR', 'IRAQ': 'IQ', 'ISRAEL': 'IL',
        'JORDAN': 'JO', 'KUWAIT': 'KW', 'LEBANON': 'LB', 'OMAN': 'OM',
        'PALESTINE': 'PS', 'QATAR': 'QA', 'SAUDI ARABIA': 'SA', 'SYRIA': 'SY',
        'UAE': 'AE', 'UNITED ARAB EMIRATES': 'AE', 'YEMEN': 'YE',
        'AFGHANISTAN': 'AF', 'ARMENIA': 'AM', 'AZERBAIJAN': 'AZ',
        'BANGLADESH': 'BD', 'BHUTAN': 'BT', 'BRUNEI': 'BN', 'CAMBODIA': 'KH',
        'CHINA': 'CN', 'EAST TIMOR': 'TL', 'TIMOR-LESTE': 'TL', 'GEORGIA': 'GE',
        'HONG KONG': 'HK', 'INDIA': 'IN', 'INDONESIA': 'ID', 'JAPAN': 'JP',
        'KAZAKHSTAN': 'KZ', 'KYRGYZSTAN': 'KG', 'LAOS': 'LA', 'MACAO': 'MO',
        'MACAU': 'MO', 'MALAYSIA': 'MY', 'MALDIVES': 'MV', 'MONGOLIA': 'MN',
        'MYANMAR': 'MM', 'BURMA': 'MM', 'NEPAL': 'NP', 'NORTH KOREA': 'KP',
        'PAKISTAN': 'PK', 'PHILIPPINES': 'PH', 'SINGAPORE': 'SG',
        'SOUTH KOREA': 'KR', 'SRI LANKA': 'LK', 'TAIWAN': 'TW',
        'TAJIKISTAN': 'TJ', 'THAILAND': 'TH', 'TURKMENISTAN': 'TM',
        'UZBEKISTAN': 'UZ', 'VIETNAM': 'VN',
        'AUSTRALIA': 'AU', 'COOK ISLANDS': 'CK', 'FIJI': 'FJ',
        'FRENCH POLYNESIA': 'PF', 'GUAM': 'GU', 'KIRIBATI': 'KI',
        'MARSHALL ISLANDS': 'MH', 'MICRONESIA': 'FM', 'NAURU': 'NR',
        'NEW CALEDONIA': 'NC', 'NEW ZEALAND': 'NZ', 'NIUE': 'NU',
        'NORTHERN MARIANA ISLANDS': 'MP', 'PALAU': 'PW',
        'PAPUA NEW GUINEA': 'PG', 'SAMOA': 'WS', 'SOLOMON ISLANDS': 'SB',
        'TONGA': 'TO', 'TUVALU': 'TV', 'VANUATU': 'VU',
        'WALLIS AND FUTUNA': 'WF',
        'ANGUILLA': 'AI', 'BRITISH VIRGIN ISLANDS': 'VG', 'SAINT HELENA': 'SH',
        'SAINT PIERRE AND MIQUELON': 'PM', 'TRISTAN DA CUNHA': 'SH',
        'KOREA': 'KR', 'KOREA, SOUTH': 'KR', 'KOREA, NORTH': 'KP',
        'LAO': 'LA', 'VIET NAM': 'VN', 'SYRIAN ARAB REPUBLIC': 'SY',
        'LIBYAN ARAB JAMAHIRIYA': 'LY', 'TANZANIAN': 'TZ',
        "DEMOCRATIC PEOPLE'S REPUBLIC OF KOREA": 'KP',
        'REPUBLIC OF KOREA': 'KR', 'ISLAMIC REPUBLIC OF IRAN': 'IR',
        'ISLAMIC REPUBLIC OF PAKISTAN': 'PK',
    };

    const _cache = new Map();
    return function getFlagCode(flagName) {
        if (!flagName || ['N/A', 'Unknown', '-', ''].includes(flagName)) return null;
        const u = flagName.toUpperCase().trim();
        if (_cache.has(u)) return _cache.get(u);
        let result = mapping[u] || null;
        if (!result) {
            let best = null, bestLen = 0;
            for (const [k, v] of Object.entries(mapping)) {
                if ((u.includes(k) || k.includes(u)) && k.length > bestLen) {
                    best = v; bestLen = k.length;
                }
            }
            result = best;
        }
        if (!result) { const pm = flagName.match(/\(([A-Z]{2})\)/); if (pm) result = pm[1]; }
        _cache.set(u, result);
        return result;
    };
})();

} // end guard