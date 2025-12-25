import { GeocodedLocation } from '../types';

export interface ProcessedRow {
  original: Record<string, string>;
  isMiddleHousing: boolean;
  housingType: string;
  notes: string;
  location?: GeocodedLocation;
  address?: string;
}

/**
 * Advanced classifier to determine if a project is "Middle Housing" (including New SFRs)
 * based on Description and Project Name.
 */
export const classifyProject = (description: string, projectName: string, address: string): ProcessedRow => {
  
  // 1. PRE-PROCESSING & TYPO CORRECTION
  // Remove special chars but keep spaces to separate words clearly
  let rawText = `${description} ${projectName}`.toLowerCase();
  
  // Remove punctuation that might glue words together
  rawText = rawText.replace(/[(),.;:!?"/-]/g, ' '); 

  const typos: Record<string, string> = {
    'strctures': 'structures',
    'struture': 'structure', 
    'structure': 'structures',
    'consruct': 'construct',
    'constuct': 'construct',
    'cnstruct': 'construct',
    'buid': 'build',
    'biuld': 'build',
    'dwellng': 'dwelling',
    'resdence': 'residence',
    'sfrs': 'sfr',
    'sfhs': 'sfr',
    'sf': 'sfr',
    'dadus': 'dadu',
    'aadus': 'aadu',
    'townhome': 'townhouse',
    'townhomes': 'townhouse',
    'twhse': 'townhouse',
    'duplx': 'duplex',
    'stfi': 'stfi' // ensure stfi is recognized
  };

  Object.keys(typos).forEach(typo => {
    const regex = new RegExp(`\\b${typo}\\b`, 'g');
    rawText = rawText.replace(regex, typos[typo]);
  });

  // Clean double spaces
  const cleanText = rawText.replace(/\s+/g, ' ').trim();

  // Helper to fail fast
  const fail = (reason: string): ProcessedRow => ({
    original: {},
    isMiddleHousing: false,
    housingType: 'Other/Remodel',
    notes: `Excluded: ${reason}`,
    address: address
  });

  // --------------------------------------------------------------------------
  // 2. HARD EXCLUSIONS ("Kill List")
  // --------------------------------------------------------------------------

  // A. STFI (Subject to Field Inspection) - Always minor work
  if (/\bstfi\b/.test(cleanText)) return fail('STFI');

  // B. Specific Repair/Damage types
  // "Water damage repairs", "Foundation repairs", "Side sewer"
  if (/\b(water damage|fire damage|storm damage|tree damage|leak repair|rot repair|dryrot)\b/.test(cleanText)) return fail('Damage Repair');
  if (/\b(foundation|seismic|earthquake|pinning|underpinning|leveling|shoring)\b/.test(cleanText)) return fail('Foundation/Seismic');
  if (/\b(side sewer|drainage|pipe|grade|grading|excavation only)\b/.test(cleanText)) return fail('Infrastructure/Grading');
  if (/\b(roof|reroof|siding|window|glazing|door replacement|egress window)\b/.test(cleanText)) return fail('Envelope/Windows/Roof');
  if (/\b(voluntary seismic|retrofit)\b/.test(cleanText)) return fail('Retrofit');

  // C. Institutional / Commercial
  const isInstitutional = /\b(school|elementary|hospital|medical|clinic|lab|church|university|uw|seattle center|park|playground)\b/.test(cleanText);
  const isCommercial = /\b(tenant improvement|ti|office|retail|restaurant|bar|store|warehouse|industrial|telecom|antenna|signage)\b/.test(cleanText);
  // Exception: Mixed use might be commercial + residential.
  const isMixedUse = /\b(mixed use|multifamily|apartment|townhouse)\b/.test(cleanText);

  if (!isMixedUse && (isInstitutional || isCommercial)) return fail('Commercial/Institutional');

  // --------------------------------------------------------------------------
  // 3. INTENT DETECTION (Creation vs Remodel/Demo)
  // --------------------------------------------------------------------------
  
  // Strong Creation Verbs
  const creationVerbs = [
    'construct', 'build', 'erect', 'establish', 'create', 
    'place', 'placement', 'install', 'propose', 'new', 'add', 'adding', 
    'develop', 'development'
  ];
  
  // Remodel/Alteration Verbs
  const remodelVerbs = [
    'remodel', 'renovate', 'renovation', 'alter', 'alteration', 'repair', 
    'replace', 'restoration', 'interior', 'kitchen', 'bath', 'deck', 'porch', 'addition', 'expand', 'expansion'
  ];

  // Check for presence
  const hasCreationVerb = creationVerbs.some(v => cleanText.includes(v));
  const hasRemodelVerb = remodelVerbs.some(v => cleanText.includes(v));
  
  // "Conversion" is a special case of creation (converting non-living to living)
  const isConversion = /\b(convert|conversion|change of use)\b/.test(cleanText) && /\b(to|into)\b/.test(cleanText);

  // Demolition Logic
  // User Rule: "Demolish existing structure" should NOT be included.
  // Exception: "Demolish existing AND construct new" SHOULD be included.
  const isDemo = /\b(demolish|demo|remove)\b/.test(cleanText);

  // If it's a demo, it MUST have a creation verb or be a ULS to be counted as a "Project" in this context.
  if (isDemo && !hasCreationVerb && !isConversion) {
      // Check if it's ULS (Unit Lot Subdivision often has no construction verb but implies housing)
      if (!/\b(uls|unit lot|subdivision|short plat)\b/.test(cleanText)) {
          return fail('Demolition Only');
      }
  }

  // Alteration Logic
  // User Rule: "Construction alterations" should be excluded.
  // If "Alteration" exists, we treat it as Remodel unless explicitly "Creating" a unit.
  const isExplicitAlteration = /\b(alteration|alterations|remodel|repair)\b/.test(cleanText);

  // --------------------------------------------------------------------------
  // 4. CLASSIFICATION LOGIC
  // --------------------------------------------------------------------------
  
  let detectedType = '';
  let matchReasons: string[] = [];
  let isTarget = false;

  // A. ULS / Short Plat
  if (/\b(uls|unit lot|short plat|lba|lot boundary|subdivide|subdivision|split lot)\b/.test(cleanText)) {
      detectedType = 'Unit Lot Subdivision (ULS)';
      matchReasons.push('ULS');
      isTarget = true;
  }

  // B. Explicit Housing Types (ADU, Townhouse, Multiplex)
  if (!detectedType) {
      if (/\b(townhouse|rowhouse)\b/.test(cleanText)) detectedType = 'Townhouse';
      else if (/\b(dadu|backyard cottage|detached adu)\b/.test(cleanText)) detectedType = 'DADU';
      else if (/\b(aadu|attached adu|basement adu|mother in law)\b/.test(cleanText)) detectedType = 'AADU';
      else if (/\b(adu|accessory dwelling)\b/.test(cleanText)) detectedType = 'ADU';
      else if (/\b(duplex|triplex|quadplex|fourplex|multiplex|stacked flat|multifamily|apartment|condo)\b/.test(cleanText)) detectedType = 'Multiplex/Multifamily';
      
      if (detectedType) {
          // VALIDATION: Is this "New/Conversion" or "Just Remodel"?
          
          if (isConversion) {
              isTarget = true;
              matchReasons.push(`${detectedType} (Conversion)`);
          } 
          else if (hasCreationVerb) {
              // "Construct Townhouse" -> Yes
              // "Construction alterations to Townhouse" -> No
              
              if (isExplicitAlteration) {
                   // Mixed signals: "Construction" AND "Alteration"
                   // Allow only if "New" or "Create" is explicitly next to the type?
                   // Easier: If it says "Alteration", we only allow ADU creation (common pattern: "Alteration to create AADU")
                   
                   const createsUnit = /\b(create|establish|new)\b/.test(cleanText);
                   const isADU = detectedType.includes('ADU');
                   
                   if (createsUnit || isADU) {
                       isTarget = true;
                       matchReasons.push(`${detectedType} (Created via Alteration)`);
                   }
              } else {
                  // No alteration keyword, just creation -> Yes
                  isTarget = true;
                  matchReasons.push(`${detectedType} (New)`);
              }
          } 
          else if (!hasRemodelVerb) {
              // No verbs at all, just "Townhouse" project name -> Yes
              isTarget = true;
              matchReasons.push(`${detectedType} (Implied New)`);
          }
      }
  }

  // C. Quantity Scanning (The "3-4 units" case)
  const numberWords = ['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
  const housingNouns = [
      'units', 'unit', 'homes', 'home', 'houses', 'house', 'dwellings', 'dwelling', 
      'residences', 'residence', 'sfr', 'cottages', 'cottage', 'structures'
  ];

  const tokens = cleanText.split(' ');

  if (!detectedType) {
    for (let i = 0; i < tokens.length; i++) {
        let count = 0;
        const t = tokens[i];

        // Parse number
        if (/^\d+$/.test(t)) {
            count = parseInt(t, 10);
        } else {
            const idx = numberWords.indexOf(t);
            if (idx !== -1) count = idx + 1;
        }

        if (count > 0) {
            const window = tokens.slice(i + 1, i + 16);
            
            // Check for immediate false positives
            const nextWord = window[0] || '';
            const isFalsePositive = ['story', 'stories', 'bed', 'bedroom', 'bath', 'car', 'stall', 'vehicle', 'van', 'level', 'phase'].some(bad => nextWord.includes(bad));

            if (!isFalsePositive) {
                const foundNoun = window.find(w => housingNouns.includes(w));
                
                if (foundNoun) {
                    // Check generic "structures"
                    if (foundNoun === 'structures') {
                        const windowStr = window.join(' ');
                        const isHousingContext = /\b(residential|dwelling|living|multifamily|single family)\b/.test(cleanText);
                        const isAccessoryContext = /\b(accessory|garage|storage)\b/.test(windowStr);
                        
                        if (!isHousingContext || isAccessoryContext) continue; 
                    }

                    // VALIDATE: If we found "2 Units", is it "Repair 2 Units" or "Construct 2 Units"?
                    // We need Creation or Conversion.
                    // "Construction (3) New Units" -> hasCreationVerb=true.
                    
                    if (hasCreationVerb || isConversion) {
                        // Filter "Construction alterations to 2 units"
                        if (isExplicitAlteration && !/\b(new|create|establish)\b/.test(cleanText)) {
                            // likely remodel of 2 units
                            continue;
                        }

                        if (count >= 2) {
                            isTarget = true;
                            matchReasons.push(`Count: ${count} ${foundNoun}`);
                            detectedType = 'Multiplex/Cluster';
                        } else if (count === 1) {
                             if (['cottage', 'dadu', 'adu'].includes(foundNoun)) {
                                 isTarget = true;
                                 detectedType = 'DADU/ADU';
                             }
                        }
                    }
                } else {
                    // Implicit Noun: "Construct 2 New"
                    if (hasCreationVerb && window.includes('new')) {
                         if (count >= 2 && !isExplicitAlteration) {
                             isTarget = true;
                             matchReasons.push(`Count: ${count} New (Implied)`);
                             detectedType = 'Multiplex/Cluster';
                         }
                    }
                }
            }
        }
    }
  }

  // D. "Second" Unit Logic
  if (!isTarget && /\b(second|2nd)\b/.test(cleanText) && /\b(unit|dwelling|residence|home)\b/.test(cleanText)) {
      if (hasCreationVerb || isConversion) {
        isTarget = true;
        matchReasons.push('Second Unit');
        detectedType = 'ADU/Duplex';
      }
  }

  // E. Single Family Residence (SFR)
  if (!detectedType) {
      const isSFR = /\b(sfr|sfh|single family|single-family|dwelling|residence|home|house)\b/.test(cleanText);
      
      if (isSFR) {
          // 1. Must have creation signal
          if (hasCreationVerb || isConversion) {
              
              // 2. Kill if Accessory is the subject
              // "Construct new garage for SFR" -> Kill
              const isAccessoryWord = /\b(garage|carport|shed|deck|porch|patio|cabana|studio)\b/.test(cleanText);
              
              let isRealSFR = true;
              if (isAccessoryWord) {
                  const explicitNewHouse = /\b(new house|new home|new sfr|construct sfr|construct house|construct dwelling|establish sfr|build sfr|erect sfr)\b/.test(cleanText);
                  // If it mentions garage but NO explicit new house -> Assume it's just the garage
                  if (!explicitNewHouse) isRealSFR = false;
              }

              // 3. Kill if Alteration is present (unless explicit New)
              // "Construction alterations to SFR" -> Kill
              if (isExplicitAlteration && !/\b(new|create|establish)\b/.test(cleanText)) {
                  isRealSFR = false;
              }

              if (isRealSFR) {
                  isTarget = true;
                  detectedType = 'Single Family Residence';
                  matchReasons.push('New SFR');
              }
          }
      }
  }

  // F. Explicit "Middle Housing" Term
  if (/\b(middle housing)\b/.test(cleanText)) {
      isTarget = true;
      detectedType = 'Middle Housing';
  }

  // G. Fallback for successful conversions not yet typed
  if (isConversion && !detectedType && isTarget === false) {
      // If we matched "Convert to Residential", we accept it
      if (/\b(residential|dwelling|living|multifamily|single family)\b/.test(cleanText)) {
          isTarget = true;
          detectedType = 'Conversion to Residential';
          matchReasons.push('Conversion');
      }
  }

  // H. Compound Project Check
  if (isTarget && /\bduplex\b/.test(cleanText) && /\bsfr\b/.test(cleanText)) {
      detectedType = 'Duplex + SFR';
  }

  return {
    original: {},
    isMiddleHousing: isTarget,
    housingType: detectedType || (isTarget ? 'Middle Housing' : 'Other/Remodel'),
    notes: matchReasons.join(', '),
    address: address
  };
};
