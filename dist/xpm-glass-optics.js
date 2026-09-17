(function registerGlassOptics(global) {
  "use strict";

function dotVector3(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalizeVector3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length < 1e-9) return [0, 0, 0];
  return vector.map((component) => component / length);
}

function reflectVector3(incident, normal) {
  const scale = 2 * dotVector3(incident, normal);
  return normalizeVector3(incident.map((component, index) =>
    component - scale * normal[index]
  ));
}

function refractVector3(incident, normal, eta) {
  const incidentDotNormal = dotVector3(incident, normal);
  const discriminant = 1 - eta * eta *
    (1 - incidentDotNormal * incidentDotNormal);
  if (discriminant < 0) return null;
  const normalScale = eta * incidentDotNormal + Math.sqrt(discriminant);
  return normalizeVector3(incident.map((component, index) =>
    eta * component - normalScale * normal[index]
  ));
}

function dielectricFresnel(cosine, indexFrom, indexTo) {
  const cosIncident = Math.max(0, Math.min(1, cosine));
  const eta = indexFrom / indexTo;
  const sinTransmittedSquared = eta * eta * (1 - cosIncident * cosIncident);
  if (sinTransmittedSquared >= 1) return 1;
  const cosTransmitted = Math.sqrt(Math.max(0, 1 - sinTransmittedSquared));
  const sDenominator = indexFrom * cosIncident + indexTo * cosTransmitted;
  const pDenominator = indexFrom * cosTransmitted + indexTo * cosIncident;
  const reflectS = sDenominator === 0
    ? 1
    : (indexFrom * cosIncident - indexTo * cosTransmitted) / sDenominator;
  const reflectP = pDenominator === 0
    ? 1
    : (indexFrom * cosTransmitted - indexTo * cosIncident) / pDenominator;
  return (reflectS * reflectS + reflectP * reflectP) / 2;
}

function traceDielectricSphere(frontNormal, indexOfRefraction) {
  const incident = [0, 0, -1];
  const entryCosine = Math.max(0, -dotVector3(incident, frontNormal));
  const entryFresnel = dielectricFresnel(entryCosine, 1, indexOfRefraction);
  const internalDirection = refractVector3(
    incident,
    frontNormal,
    1 / indexOfRefraction,
  );
  if (!internalDirection) {
    return { transmission: 0, pathLength: 0, totalInternalReflection: true };
  }

  const distanceToExit = Math.max(
    0,
    -2 * dotVector3(frontNormal, internalDirection),
  );
  const exitPoint = frontNormal.map((component, index) =>
    component + internalDirection[index] * distanceToExit
  );
  const exitNormal = normalizeVector3(exitPoint);
  const exitCosine = Math.max(0, dotVector3(internalDirection, exitNormal));
  const criticalAngle = Math.asin(Math.min(1, 1 / indexOfRefraction));
  const exitAngle = Math.acos(Math.max(-1, Math.min(1, exitCosine)));

  if (exitAngle > criticalAngle + 1e-7) {
    return {
      transmission: 0,
      pathLength: distanceToExit,
      totalInternalReflection: true,
      internalReflection: reflectVector3(internalDirection, exitNormal),
    };
  }

  const exitDirection = refractVector3(
    internalDirection,
    exitNormal.map((component) => -component),
    indexOfRefraction,
  );
  if (!exitDirection) {
    return {
      transmission: 0,
      pathLength: distanceToExit,
      totalInternalReflection: true,
      internalReflection: reflectVector3(internalDirection, exitNormal),
    };
  }

  const exitFresnel = dielectricFresnel(exitCosine, indexOfRefraction, 1);
  const transmission = (1 - entryFresnel) * (1 - exitFresnel);
  const backgroundPlaneZ = -1.55;
  const distanceToBackground = exitDirection[2] < -1e-6
    ? Math.max(0, (backgroundPlaneZ - exitPoint[2]) / exitDirection[2])
    : 0;
  const backgroundPoint = exitPoint.map((component, index) =>
    component + exitDirection[index] * distanceToBackground
  );

  return {
    backgroundX: backgroundPoint[0],
    backgroundY: backgroundPoint[1],
    pathLength: distanceToExit,
    transmission,
    totalInternalReflection: false,
  };
}

  global.XpmGlassOptics = Object.freeze({dotVector3, normalizeVector3, reflectVector3, refractVector3, dielectricFresnel, traceDielectricSphere});
})(globalThis);
