// Vendor
import firebase from 'firebase/app';
import 'firebase/firestore';
import {
  takeEvery, takeLatest, fork, put, select,
} from 'redux-saga/effects';
import pick from 'lodash/pick';
import { DateTime } from 'luxon';

// Application
import { selectUser } from 'modules/Auth';

import {
  TIMESLOT_STATUS_NEEDS_MENTOR,
  TIMESLOT_STATUS_MENTOR_NEEDS_APPROVE,
  TIMESLOT_STATUS_HAS_MENTOR,
} from 'shared/constants/timeslots';

import getUserPosition from 'shared/utils/helpers/getUserLocation';

import {
  APPLY_TIMESLOT,
  CANCEL_TIMESLOT,
  FETCH_TIMESLOTS,
  FETCH_MY_TIMESLOTS,
  GET_USER_GEOLOCATION,
} from './constants';

import {
  applyTimeslotFailure,
  applyTimeslotSuccess,
  fetchTimeslotsFailure,
  fetchTimeslotsSuccess,
  cancelTimeslotFailure,
  cancelTimeslotSuccess,
  fetchMyTimeslotsFailure,
  fetchMyTimeslotsSuccess,
  getUserGeolocationFailure,
  getUserGeolocationSuccess,
} from './actions';


function* applyTimeslot({ payload: { timeslotId } }) {
  try {
    const firestore = firebase.firestore();

    const user = yield select(selectUser());

    const timeslotRef = firestore.collection('timeslots').doc(timeslotId);

    yield firestore.runTransaction(transaction => transaction.get(timeslotRef)
      .then((doc) => {
        if (!doc.exists) {
          throw new Error('Document does not exist!');
        }

        const docData = doc.data();

        if (docData.mentorId) {
          throw new Error('Timeslot already has a mentor');
        }

        if (docData.status !== TIMESLOT_STATUS_NEEDS_MENTOR) {
          throw new Error('You can\'t apply at the moment');
        }

        // var newPopulation = sfDoc.data().population + 1;
        return transaction.update(timeslotRef, { mentorId: user.uid });
      }));

    const updatedSnapshot = yield timeslotRef.get();

    const updatedTimeslot = { ...updatedSnapshot.data(), id: updatedSnapshot.id };

    yield put(applyTimeslotSuccess(updatedTimeslot));
  } catch (error) {
    yield put(applyTimeslotFailure(error));
  }
}

function* cancelTimeslot({ payload: { id } }) {
  try {
    const firestore = firebase.firestore();

    const user = yield select(selectUser());

    const timeslotRef = firestore.collection('timeslots').doc(id);

    yield firestore.runTransaction(transaction => transaction.get(timeslotRef)
      .then((doc) => {
        if (!doc.exists) {
          throw new Error('Timeslot does not exist!');
        }

        const docData = doc.data();

        if (docData.mentorId !== user.uid) {
          throw new Error('Timeslot isn\t your');
        }

        if (
          docData.status !== TIMESLOT_STATUS_HAS_MENTOR
          && docData.status !== TIMESLOT_STATUS_MENTOR_NEEDS_APPROVE
        ) {
          throw new Error('You can\'t cancel at the moment');
        }

        // var newPopulation = sfDoc.data().population + 1;
        return transaction.update(timeslotRef, { mentorId: null, status: TIMESLOT_STATUS_NEEDS_MENTOR });
      }));

    // const updatedSnapshot = yield timeslotRef.get();

    // const updatedTimeslot = { ...updatedSnapshot.data(), id: updatedSnapshot.id };


    // yield firebase.firestore().collection('timeslots').doc(id).cancel();

    yield put(cancelTimeslotSuccess());
  } catch (error) {
    yield put(cancelTimeslotFailure(error));
  }
}

/**
 * fetch timeslots without mentor
 */
function* fetchTimeslots({ payload: { bounds, ...payload } }) {
  try {
    const date = DateTime.fromJSDate(payload.from).toISODate();
    let query = firebase.firestore().collection('timeslots');

    query = query.where('date', '==', date);

    const southWest = new firebase.firestore.GeoPoint(bounds.southWest.lat, bounds.southWest.lng);
    const northEast = new firebase.firestore.GeoPoint(bounds.northEast.lat, bounds.northEast.lng);

    query = query
      .where('geo', '>', southWest)
      .where('geo', '<', northEast);

    query = query
      .orderBy('geo', 'asc')
      .orderBy('startTime', 'asc')
      .where('status', '==', TIMESLOT_STATUS_NEEDS_MENTOR)
      .where('mentorId', '==', null);

    // const timeslotsSnaps = yield firebase.firestore().collection('timeslots')
    // .where('status', '==', TIMESLOT_STATUS_NEEDS_MENTOR)
    // .where('mentorId', '==', null)
    //   .where('date', '==', date)
    //   // .where('startTime', '>=', from)
    //   // .where('startTime', '<', to)
    //   .orderBy('startTime', 'asc')
    //   .orderBy('schoolId', 'asc')
    //   .get();

    const timeslotsSnaps = yield query.get();

    const timeslots = timeslotsSnaps.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .map(timeslot => ({
        ...timeslot,
        startTime: timeslot.startTime.toDate(),
      }))
      .filter(({ geo, startTime }) => (
        geo.latitude >= bounds.southWest.lat
        && geo.longitude >= bounds.southWest.lng
        && geo.latitude <= bounds.northEast.lat
        && geo.longitude <= bounds.northEast.lng
        && startTime >= payload.from
        && startTime <= payload.to
      ));

    yield put(fetchTimeslotsSuccess(timeslots));
  } catch (error) {
    yield put(fetchTimeslotsFailure(error));
  }
}

const getSchool = async (schoolId) => {
  const schoolSnap = await firebase.firestore().collection('schools').doc(schoolId).get();

  const school = { ...schoolSnap.data(), id: schoolId };

  const teachersSnaps = await firebase.firestore().collection('teachers')
    .where('schoolId', '==', schoolId).limit(1)
    .get();

  const teacherId = teachersSnaps.docs[0].id;
  // const teacher = { ...teachersSnaps.docs[0].data() };

  const profileSnap = await firebase.firestore().collection('users').doc(teacherId).get();
  const profile = { ...profileSnap.data(), uid: teacherId };

  return {
    ...school,
    teacher: profile,
  };
};

/**
 * fetch mentor's timeslots
 */
function* fetchMyTimeslots() {
  try {
    const user = yield select(selectUser());

    const timeslotsSnaps = yield firebase.firestore().collection('timeslots')
      .where('mentorId', '==', user.uid)
      .orderBy('startTime', 'asc')
      .orderBy('schoolId', 'asc')
      .get();

    const schoolIds = timeslotsSnaps.docs.map(d => d.get('schoolId'));

    const schools = yield Promise.all(schoolIds.map(id => getSchool(id)));

    const timeslots = timeslotsSnaps.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .map(timeslot => ({
        ...timeslot,
        startTime: timeslot.startTime.toDate(),
        school: schools.find(s => s.id === timeslot.schoolId),
      }));

    yield put(fetchMyTimeslotsSuccess(timeslots));
  } catch (error) {
    yield put(fetchMyTimeslotsFailure(error));
  }
}

function* getUserGeolocation() {
  try {
    const position = yield getUserPosition();

    const location = (position && position.coords) ? pick(position.coords, ['latitude', 'longitude', 'accuracy']) : null;

    yield put(getUserGeolocationSuccess(location));
  } catch (error) {
    yield put(getUserGeolocationFailure(error));
  }
}

/**
 * Root saga manages watcher lifecycle
 */
function* rootSaga() {
  yield fork(takeEvery, APPLY_TIMESLOT, applyTimeslot);
  yield fork(takeEvery, CANCEL_TIMESLOT, cancelTimeslot);
  yield fork(takeLatest, FETCH_TIMESLOTS, fetchTimeslots);
  yield fork(takeLatest, FETCH_MY_TIMESLOTS, fetchMyTimeslots);
  yield fork(takeLatest, GET_USER_GEOLOCATION, getUserGeolocation);
}

export default [
  rootSaga,
];
// Exports for testing
export {
  applyTimeslot,
  cancelTimeslot,
  fetchTimeslots,
  rootSaga,
};
