-- =============================================================================
-- 06_backfill_invariants.sql — T-A03 Invariant Checks
-- Run after 05_item_groups_backfill.sql to verify correctness.
-- Every row should show PASS. Any FAIL is a bug.
-- =============================================================================

SELECT id, check_name, expected::TEXT, actual::TEXT, result FROM (

    -- CHK-1: composite builds match distinct parent_eans
    SELECT 'CHK-1' AS id,
           'composite builds == distinct parent_eans' AS check_name,
           (SELECT count(DISTINCT parent_ean) FROM ean_compositions) AS expected,
           (SELECT count(*) FROM builds
            WHERE build_code IN (SELECT DISTINCT parent_ean FROM ean_compositions)) AS actual,
           CASE WHEN
               (SELECT count(DISTINCT parent_ean) FROM ean_compositions) =
               (SELECT count(*) FROM builds
                WHERE build_code IN (SELECT DISTINCT parent_ean FROM ean_compositions))
           THEN 'PASS' ELSE 'FAIL' END AS result

    UNION ALL

    -- CHK-2: item_groups from components == distinct component_eans
    SELECT 'CHK-2',
           'item_groups from components == distinct component_eans',
           (SELECT count(DISTINCT component_ean) FROM ean_compositions),
           (SELECT count(*) FROM item_groups
            WHERE code IN (SELECT DISTINCT component_ean FROM ean_compositions)),
           CASE WHEN
               (SELECT count(DISTINCT component_ean) FROM ean_compositions) =
               (SELECT count(*) FROM item_groups
                WHERE code IN (SELECT DISTINCT component_ean FROM ean_compositions))
           THEN 'PASS' ELSE 'FAIL' END

    UNION ALL

    -- CHK-3: build_components from compositions == ean_compositions rows
    SELECT 'CHK-3',
           'build_components from compositions == ean_compositions rows',
           (SELECT count(*) FROM ean_compositions),
           (SELECT count(*) FROM build_components bc
            JOIN builds b ON bc.build_id = b.id
            WHERE b.build_code IN (SELECT DISTINCT parent_ean FROM ean_compositions)),
           CASE WHEN
               (SELECT count(*) FROM ean_compositions) =
               (SELECT count(*) FROM build_components bc
                JOIN builds b ON bc.build_id = b.id
                WHERE b.build_code IN (SELECT DISTINCT parent_ean FROM ean_compositions))
           THEN 'PASS' ELSE 'FAIL' END

    UNION ALL

    -- CHK-4: every product has a build (D-018)
    SELECT 'CHK-4',
           'products without a build == 0',
           0::BIGINT,
           (SELECT count(*) FROM products p
            WHERE NOT EXISTS (SELECT 1 FROM builds b WHERE b.build_code = p.ean)),
           CASE WHEN
               (SELECT count(*) FROM products p
                WHERE NOT EXISTS (SELECT 1 FROM builds b WHERE b.build_code = p.ean)) = 0
           THEN 'PASS' ELSE 'FAIL' END

    UNION ALL

    -- CHK-5: every sku_aliases row migrated to external_item_xref
    SELECT 'CHK-5',
           'unmigrated sku_aliases == 0',
           0::BIGINT,
           (SELECT count(*) FROM sku_aliases sa
            WHERE NOT EXISTS (
                SELECT 1 FROM external_item_xref x
                WHERE x.external_sku = sa.marketplace_sku
                  AND x.marketplace = COALESCE(sa.marketplace, 'unknown'))),
           CASE WHEN
               (SELECT count(*) FROM sku_aliases sa
                WHERE NOT EXISTS (
                    SELECT 1 FROM external_item_xref x
                    WHERE x.external_sku = sa.marketplace_sku
                      AND x.marketplace = COALESCE(sa.marketplace, 'unknown'))) = 0
           THEN 'PASS' ELSE 'FAIL' END

    UNION ALL

    -- CHK-6: every product has an item_group (code = EAN)
    SELECT 'CHK-6',
           'products without an item_group == 0',
           0::BIGINT,
           (SELECT count(*) FROM products p
            WHERE NOT EXISTS (SELECT 1 FROM item_groups ig WHERE ig.code = p.ean)),
           CASE WHEN
               (SELECT count(*) FROM products p
                WHERE NOT EXISTS (SELECT 1 FROM item_groups ig WHERE ig.code = p.ean)) = 0
           THEN 'PASS' ELSE 'FAIL' END

    UNION ALL

    -- CHK-7: every product is a member of its own item_group
    SELECT 'CHK-7',
           'products without item_group membership == 0',
           0::BIGINT,
           (SELECT count(*) FROM products p
            WHERE NOT EXISTS (
                SELECT 1 FROM item_group_members igm
                JOIN item_groups ig ON ig.id = igm.item_group_id
                WHERE igm.product_id = p.id AND ig.code = p.ean)),
           CASE WHEN
               (SELECT count(*) FROM products p
                WHERE NOT EXISTS (
                    SELECT 1 FROM item_group_members igm
                    JOIN item_groups ig ON ig.id = igm.item_group_id
                    WHERE igm.product_id = p.id AND ig.code = p.ean)) = 0
           THEN 'PASS' ELSE 'FAIL' END

    UNION ALL

    -- CHK-8: every build has at least one component
    SELECT 'CHK-8',
           'builds without components == 0',
           0::BIGINT,
           (SELECT count(*) FROM builds b
            WHERE NOT EXISTS (SELECT 1 FROM build_components bc WHERE bc.build_id = b.id)),
           CASE WHEN
               (SELECT count(*) FROM builds b
                WHERE NOT EXISTS (SELECT 1 FROM build_components bc WHERE bc.build_id = b.id)) = 0
           THEN 'PASS' ELSE 'FAIL' END

) checks
ORDER BY id;

-- Summary counts for manual review
SELECT
    (SELECT count(*) FROM builds) AS total_builds,
    (SELECT count(*) FROM builds WHERE is_auto_generated) AS auto_builds,
    (SELECT count(*) FROM item_groups) AS total_groups,
    (SELECT count(*) FROM item_group_members) AS total_members,
    (SELECT count(*) FROM build_components) AS total_components,
    (SELECT count(*) FROM external_item_xref) AS total_xref;
