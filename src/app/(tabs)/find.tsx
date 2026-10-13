import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { allFields, formatFee, OFFICES, officeCountByRegion, regionName, searchLawyers, type LawyerFilter } from '@/core/offices';
import { Avatar, Chip, Chips, Empty, Input, Row, Screen, Section } from '@/ui/kit';
import { KoreaMap } from '@/ui/korea-map';
import { KOREA_REGIONS } from '@/data/korea-map';
import { space } from '@/ui/theme';

const SORTS: { key: LawyerFilter['sort']; label: string }[] = [
  { key: 'career', label: '경력순' },
  { key: 'consultFee', label: '상담료 낮은순' },
  { key: 'name', label: '이름순' },
];

export default function FindScreen() {
  const [regionCode, setRegion] = useState<string>();
  const [field, setField] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<LawyerFilter['sort']>('career');
  const rows = useMemo(() => searchLawyers({ regionCode, field, keyword, sort }), [regionCode, field, keyword, sort]);
  const counts = useMemo(() => officeCountByRegion(), []);
  const pins = OFFICES.filter((o) => o.lat && o.lon).map((o) => ({ id: o.id, lat: o.lat!, lon: o.lon! }));

  return (
    <Screen title="변호사 찾기">
      <View style={{ marginVertical: space.md }}>
        <KoreaMap counts={counts} selected={regionCode} onSelect={setRegion} pins={pins} />
      </View>
      <Chips>
        <Chip label="전국" active={!regionCode} onPress={() => setRegion(undefined)} />
        {KOREA_REGIONS.map((r) => (
          <Chip key={r.code} label={counts[r.code] ? `${r.short} ${counts[r.code]}` : r.short} active={regionCode === r.code} onPress={() => setRegion(regionCode === r.code ? undefined : r.code)} />
        ))}
      </Chips>
      <Input placeholder="이름·분야·사무소 검색" value={keyword} onChangeText={setKeyword} />
      <Chips>
        <Chip label="전체 분야" active={!field} onPress={() => setField(undefined)} />
        {allFields().map((f) => (
          <Chip key={f} label={f} active={field === f} onPress={() => setField(field === f ? undefined : f)} />
        ))}
      </Chips>
      <Chips>
        {SORTS.map((s) => (
          <Chip key={s.key} label={s.label} active={sort === s.key} onPress={() => setSort(s.key)} />
        ))}
      </Chips>
      <Section title={regionCode ? `${regionName(regionCode)} 변호사 ${rows.length}명` : `전국 변호사 ${rows.length}명`}>
        {rows.length ? (
          rows.map((l) => (
            <Row
              key={l.id}
              left={<Avatar name={l.name} />}
              title={l.name}
              sub={`${l.office.name} · ${l.fields.join(', ')} · 경력 ${l.careerYears}년 · ${formatFee(l.consultFee)}`}
              onPress={() => router.push({ pathname: '/lawyer/[id]', params: { id: l.id } })}
            />
          ))
        ) : (
          <Empty text="조건에 맞는 변호사가 없습니다." />
        )}
      </Section>
    </Screen>
  );
}
