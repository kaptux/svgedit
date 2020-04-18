function openOpenSlice(openPath1, openPath2) {
  const p1 = openPath1.clone(false);
  const intersections = p1.getIntersections(openPath2);

  const res = [];
  let lastRes = p1;

  res.push(lastRes);
  for (const intersection of intersections) {
    lastRes = lastRes.split(intersection);
    res.push(lastRes);
  }

  return res;
}

function getSegHash(segments) {
  const res = {};
  segments.forEach(seg => {
    [seg.firstSegment.point, seg.lastSegment.point].forEach(p => {
      res[p.toString()] = seg;
    });
  });
  return res;
}

function openCloseSlice(openPath, closePath, lineSegments) {
  if (lineSegments.length == 0) {
    return;
  }

  const res = [];
  const segments = openOpenSlice(closePath, openPath);
  segments.shift();

  // 1. Filtramos los segmentos pares/impares en función de la localización del primer punto
  const modRes = closePath.contains(lineSegments[0].firstSegment.point) ? 1 : 0;
  const closeSegments = lineSegments.filter((e, i) => i % 2 == modRes);

  const linePointMap = getSegHash(closeSegments);
  const openPointMap = getSegHash(segments);

  const pointMaps = [openPointMap, linePointMap];
  for (const seg of segments) {
    if (!seg.used) {
      let nextSeg = linePointMap[seg.lastSegment.point.toString()];
      let i = 0;
      while (nextSeg) {
        nextSeg.used = true;
        seg.join(nextSeg, 0.1);
        if (seg.closed) {
          break;
        }

        nextSeg = pointMaps[i % 2][nextSeg.lastSegment.point.toString()];
        i++;
      }
      res.push(seg);
    }
  }

  return res;
}

function slicePaths(p1, p2) {
  let res = [];

  function addRes(p) {
    res.push(p.children || p);
  }

  if (!p1.closed && !p2.closed) {
    addRes(openOpenSlice(p1, p2));
    addRes(openOpenSlice(p2, p1));
  } else if (p1.closed && !p2.closed) {
    const lineSements = openOpenSlice(p1, p2);
    addRes(lineSements);
    addRes(openCloseSlice(p1, p2, lineSements));
  }

  return res.flat();
}

export default slicePaths;
