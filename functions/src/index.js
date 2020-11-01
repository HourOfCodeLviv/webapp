/* eslint-disable import/prefer-default-export */

import * as functions from 'firebase-functions';
// import admin from 'firebase-admin';

import { DateTime, Settings } from 'luxon';
import rp from 'request-promise';

import sendEmail from './lib/sendEmail';
import renderTemplate from './lib/renderTemplate';
import admin from './lib/firebase';
import loadUserInfo, { loadUserProfile } from './lib/loadUserInfo';
import { sendEmailToAdmins } from './admin';

import reportSchoolStats from './reports/report-school-stats';

import {
  TIMESLOT_STATUS_NEEDS_APPROVE,
  TIMESLOT_STATUS_APPROVED,
  TIMESLOT_STATUS_NEEDS_MENTOR,
  TIMESLOT_STATUS_HAS_MENTOR,
  TIMESLOT_STATUS_MENTOR_NEEDS_APPROVE,
} from './constants/timeslots';

Settings.defaultZoneName = 'Europe/Kiev';

const firestore = admin.firestore();
// firestore.settings({ timestampsInSnapshots: true });

const updateSchoolsTimeslotsCount = functions
  .region('europe-west1')
  .firestore
  .document('timeslots/{timeslotId}')
  .onWrite(async (change, context) => {
    const document = change.after.exists ? change.after.data() : null;
    const oldDocument = change.before.data();

    const schoolId = document ? document.schoolId : oldDocument.schoolId;

    const timeslotDocs = await firestore.collection('timeslots')
      .where('schoolId', '==', schoolId)
      .get();

    const timeslots = timeslotDocs.docs
      .map(d => d.data())
      .filter(d => !d.mentorId);

    await firestore.collection('schools').doc(schoolId).set({
      availableTimeslotsCount: timeslots.length,
      timeslotsCount: timeslotDocs.docs.length,
    }, { merge: true });
  });

const updateMentorTimeslotsCount = functions
  .region('europe-west1')
  .firestore
  .document('timeslots/{timeslotId}')
  .onWrite(async (change, context) => {
    const oldValue = change.before.exists ? change.before.data() : null;
    const newValue = change.after.exists ? change.after.data() : null;

    const mentorId = (oldValue && oldValue.mentorId) || (newValue && newValue.mentorId);
    console.log('mentorId', mentorId);

    if (!mentorId) {
      return;
    }

    const statuses = [
      TIMESLOT_STATUS_HAS_MENTOR,
      TIMESLOT_STATUS_MENTOR_NEEDS_APPROVE,
    ];

    if (
      (oldValue && statuses.includes(oldValue.status))
      || (newValue && statuses.includes(newValue.status))
    ) {
      const mentorRef = firestore.collection('mentors').doc(mentorId);
      const query = firestore.collection('timeslots').where('mentorId', '==', mentorId);

      await firestore.runTransaction(async (transaction) => {
        const slots = await transaction.get(query);

        return transaction.update(mentorRef, {
          timeslotsCount: slots.docs.length,
          approvedTimeslotsCount: slots.docs
            .filter(d => d.get('status') === 20)
            .length
        });
      });
    }
  });

const emailTeacherApproved = functions
  .region('europe-west1')
  .firestore
  .document('teachers/{uid}')
  .onUpdate(async (change, context) => {
    const newValue = change.after.data();
    const oldValue = change.before.data();

    if (oldValue.isApproved || !newValue.isApproved) {
      return;
    }

    const { uid } = context.params;

    const userRecord = await admin.auth().getUser(uid);
    await sendEmail({
      to: userRecord.email,
      subject: 'Ваш доступ підтверджено',
      // text: 'Ваш доступ було підтверджено адміністратором',
      html: renderTemplate('email-teacher-approved', {
        displayName: userRecord.displayName,
      })
    });
    console.log('Email sent', userRecord.toJSON());
  });

const emailTeacherNeedsApprove = functions
  .region('europe-west1')
  .firestore
  .document('teachers/{uid}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) {
      // teacher deleted
      return;
    }

    const teacher = change.after.data();
    const oldValue = change.before.data();

    if (
      !teacher.schoolId // teacher hasn't school yet
      || oldValue.isApproved || teacher.isApproved // teacher is already approved
    ) {
      return;
    }

    const { uid } = context.params;
    const userSnap = await firestore.collection('users').doc(context.params.uid).get();
    const user = userSnap.data();

    const teacherUserRecord = await admin.auth().getUser(uid);

    const schoolSnap = await firestore.collection('schools').doc(teacher.schoolId).get();
    const school = schoolSnap.data();

    const adminSnaps = await firestore.collection('admins').get();

    const admins = await Promise.all(
      adminSnaps.docs
        .map(doc => doc.id)
        .map(uid => admin.auth().getUser(uid))
    );

    const adminEmails = admins.map(userRecord => userRecord.email);
    console.log('sending email');
    await sendEmail({
      bcc: adminEmails.filter(v => v).join(),
      subject: 'Новий вчитель потребує підтвердження',
      text: `Вчитель ${teacherUserRecord.displayName} з школи "${school.name}" потребує підтвердження.`,
      html: renderTemplate('email-teacher-needs-approve', {
        school,
        teacher: teacherUserRecord,
        url: `${functions.config().general.host}/teachers`,
      })
    });
    console.log('Email sent');
  });

const getSchool = async (id) => {
  const snap = await firestore.collection('schools').doc(id).get();
  return { ...snap.data(), id };
}

const getSchoolTeachers = async (schoolId) => {
  const teacherSnaps = await firestore.collection('teachers')
    .where('schoolId', '==', schoolId)
    .get();

  const teachers = await Promise.all(
    teacherSnaps.docs
      .map(doc => doc.id)
      .map(uid => loadUserInfo(uid))
      // .map(uid => admin.auth().getUser(uid))
  );

  return teachers;
}

const timeslotMentorApproved = functions
  .region('europe-west1')
  .firestore
  .document('timeslots/{id}')
  .onUpdate(async (change, context) => {
    console.log('Timeslot', context.id, ': mentor was approved');
    const newValue = change.after.data();
    const timeslot = newValue;
    const oldValue = change.before.data();
    const { id } = change.after;

    const school = await getSchool(timeslot.schoolId);

    const teachers = await getSchoolTeachers(timeslot.schoolId);
    const { profile: teacher } = teachers[0];

    const { profile: mentor } = await loadUserInfo(timeslot.mentorId);

    if (oldValue.status === TIMESLOT_STATUS_MENTOR_NEEDS_APPROVE && newValue.status === TIMESLOT_STATUS_HAS_MENTOR) {
      const approvedSnaps = await firestore.collection('timeslots')
        .where('mentorId', '==', timeslot.mentorId)
        .where('status', '==', TIMESLOT_STATUS_HAS_MENTOR)
        .get();
      const approvedTimeslotsCount = approvedSnaps.docs.length;

      // send email to mentor
      await sendEmail({
        to: `${mentor.firstName} ${mentor.lastName} <${mentor.email}>`,
        subject: 'Статус обраних уроків: підтверджено',
        html: renderTemplate('emails/mentor/timeslot-approved', {
          school,
          mentor,
          teacher,
          timeslot: {
            ...timeslot,
            startTime: timeslot.startTime.toDate(),
            startTimeFormatted: DateTime.fromJSDate(timeslot.startTime.toDate()).toLocaleString(DateTime.DATETIME_SHORT),
          },
          url: `${functions.config().general.host}`,
          approvedTimeslotsCount,
        })
      });

      // send email to teachers
      await Promise.all(
        teachers.map(t => t.profile).map(
          t => sendEmail({
            to: `${t.firstName} ${t.lastName} <${t.email}>`,
            subject: 'На Ваш урок записався ментор!',
            html: renderTemplate('emails/teacher/timeslot-mentor-approved', {
              school,
              teacher: t,
              mentor,
              timeslot: {
                ...timeslot,
                startTime: timeslot.startTime.toDate(),
                startTimeFormatted: DateTime.fromJSDate(timeslot.startTime.toDate()).toLocaleString(DateTime.DATETIME_SHORT),
              },
              url: `${functions.config().general.host}`,
            })
          }),
        ),
      );
    }
  });

const timeslotUpdated = functions
  .region('europe-west1')
  .firestore
  .document('timeslots/{id}')
  .onWrite(async (change, context) => {

    console.log('timeslot', Boolean(change.before.exists), Boolean(change.after.exists));
    if (!change.after.exists) {
      // timeslot deleted
      console.log('Timeslot deleted');
      return;
    }

    const newValue = change.after.exists ? change.after.data() : null;
    const oldValue = change.before.exists ? change.before.data() : null;

    if (!change.before.exists) {
      console.log('Timeslot created')
    }

    if (
      !newValue.schoolId // timeslot hasn't school
    ) {
      console.log('Invalid timeslot');
      return;
    }

    const schoolSnap = await firestore.collection('schools').doc(newValue.schoolId).get();
    const school = schoolSnap.data();

    if (
      !newValue.status
      || newValue.mentorId === undefined
      || !newValue.geo
      || !newValue.date
    ) {
      const defaultData = {};

      if (!newValue.status) {
        defaultData.status = TIMESLOT_STATUS_NEEDS_APPROVE;
      }

      if (newValue.mentorId === undefined) {
        defaultData.mentorId = null;
      }

      if (!newValue.geo) {
        defaultData.geo = new admin.firestore.GeoPoint(school.latitude, school.longitude);
      }

      if (!newValue.date) {
        defaultData.date = DateTime.fromJSDate(newValue.startTime.toDate()).toISODate();
      }

      await change.after.ref.set(defaultData, { merge: true });
      console.log('Default data set');
    }

    if (!change.before.exists) {


      await sendEmailToAdmins(
        'Новий урок потребує підтвердження',
        'email-timeslot-needs-approve',
        {
          school,
          url: `${functions.config().general.host}/timeslots`,
        }
      );
      console.log('Email sent');
    }

    if (oldValue && newValue && oldValue.status !== newValue.status) {
      // changed status

      if (oldValue.status === TIMESLOT_STATUS_NEEDS_APPROVE && newValue.status === TIMESLOT_STATUS_APPROVED) {
        console.log('Timeslot was approved');
        // timeslot was approved

        // get teachers profile data
        const teacherSnaps = await firestore.collection('teachers')
          .where('schoolId', '==', newValue.schoolId)
          .get();
        const teachers = await Promise.all(
          teacherSnaps.docs
            .map(doc => doc.id)
            .map(uid => admin.auth().getUser(uid))
        );

        await Promise.all(
          teachers.map(
            teacherUserRecord => sendEmail({
              to: teacherUserRecord.email,
              subject: 'Статус додавання уроків: підтверджено',
              html: renderTemplate('email-teacher-timeslot-approved', {
                school,
                teacher: teacherUserRecord,
                timeslot: {
                  ...newValue,
                  startTime: newValue.startTime.toDate(),
                  startTimeFormatted: DateTime.fromJSDate(newValue.startTime.toDate()).toLocaleString(DateTime.DATETIME_SHORT),
                },
                url: `${functions.config().general.host}`,
              })
            }),
          ),
        );

        // await sendEmail({
        //   bcc: teachers.map(t => t.email).filter(v => v).join(),
        //   subject: 'Урок підтверджено',
        //   // text: `Вчитель ${teacherUserRecord.displayName} з школи "${school.name}" потребує підтвердження.`,
        //   html: renderTemplate('email-teacher-timeslot-approved', {
        //     school,
        //     teacher: teacherUserRecord,
        //     url: `${functions.config().general.host}/teachers`,
        //   })
        // });
        console.log('Email to teachers sent');

        // const adminEmails = admins.map(userRecord => userRecord.email);

        // send email to teacher
      }

    }

    if (oldValue && newValue && newValue.status === TIMESLOT_STATUS_APPROVED && newValue.mentorId) {
      await change.after.ref.set({ status: TIMESLOT_STATUS_MENTOR_NEEDS_APPROVE }, { merge: true });
      console.log('mentor applied');
    }

    if (oldValue && newValue) {
      // onUpdate

      if (oldValue.status !== newValue.status && newValue.status === TIMESLOT_STATUS_MENTOR_NEEDS_APPROVE) {
        const slots = await firestore.collection('timeslots').where('mentorId', '==', newValue.mentorId).get();

        const query = firestore.collection('timeslots').where('mentorId', '==', newValue.mentorId);
        try {
          await firestore.runTransaction(async (transaction) => {
            const slots = await transaction.get(query);

            if (slots.docs.length > 3) {
              throw new Error('Autoapply limit exceeded');
            }

            return transaction.update(change.after.ref, { status: TIMESLOT_STATUS_HAS_MENTOR });
          });
          console.log('Mentor for timeslot', change.after.id, 'autoapproved');
        } catch (error) {
          console.log(error);
          const timeslot = newValue;
          const mentorUserRecord = await admin.auth().getUser(timeslot.mentorId);
          await sendEmailToAdmins(
            'Ментор потребує підтвердження проведення уроку',
            'emails/admin/timeslot-mentor-needs-approve',
            {
              school,
              mentor: mentorUserRecord,
              timeslot: {
                ...timeslot,
                startTime: timeslot.startTime.toDate(),
                startTimeFormatted: DateTime.fromJSDate(timeslot.startTime.toDate()).toLocaleString(DateTime.DATETIME_SHORT),
              },
              url: `${functions.config().general.host}/timeslots`,
            }
          )
        }
      }
    }

    // const { uid } = context.params;
    // const userSnap = await firestore.collection('users').doc(context.params.uid).get();
    // const user = userSnap.data();

    // const teacherUserRecord = await admin.auth().getUser(uid);

    // const schoolSnap = await firestore.collection('schools').doc(teacher.schoolId).get();
    // const school = schoolSnap.data();

    // const adminSnaps = await firestore.collection('admins').get();

    // const admins = await Promise.all(
    //   adminSnaps.docs
    //     .map(doc => doc.id)
    //     .map(uid => admin.auth().getUser(uid))
    // );

    // const adminEmails = admins.map(userRecord => userRecord.email);

    // await sendEmail({
    //   bcc: adminEmails.filter(v => v).join(),
    //   subject: 'Новий вчитель потребує підтвердження',
    //   text: `Вчитель ${teacherUserRecord.displayName} з школи "${school.name}" потребує підтвердження.`,
    //   html: renderTemplate('email-teacher-needs-approve', {
    //     school,
    //     teacher: teacherUserRecord,
    //     url: `${functions.config().general.host}/teachers`,
    //   })
    // });
    // console.log('Email sent');
  });

const userCleanup = functions
  .region('europe-west1')
  .auth
  .user()
  .onDelete(async (user) => {
    const { uid } = user;
    await firestore.collection('teachers').doc(uid).delete();
    await firestore.collection('mentors').doc(uid).delete();
    await firestore.collection('admins').doc(uid).delete();
    await firestore.collection('users').doc(uid).delete();
  });

const deleteTimeslot = functions
  .region('europe-west1')
  .https
  .onCall(async ({ timeslotId, reason }, context) => {
    const uid = context.auth.uid;

    const timeslotSnap = await firestore.collection('timeslots').doc(timeslotId).get();
    if (!timeslotSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Not Found');
    }
    const timeslot = timeslotSnap.data();

    const schoolSnap = await firestore.collection('schools').doc(timeslot.schoolId).get();
    const school = schoolSnap.data();

    const adminSnap = await firestore.collection('admins').doc(uid).get();
    if (adminSnap.exists) {
      await firestore.collection('timeslots').doc(timeslotId).delete();

      if (timeslot.mentorId) {
        // get mentor and send them email
        const mentorUserRecord = await admin.auth().getUser(timeslot.mentorId);
        await sendEmail({
          to: `${mentorUserRecord.displayName} <${mentorUserRecord.email}>`,
          subject: 'Статус обраних уроків: відхилено',
          html: renderTemplate('emails/mentor/admin-deleted-timeslot', {
            school,
            mentor: mentorUserRecord,
            reason,
            timeslot: {
              ...timeslot,
              startTime: timeslot.startTime.toDate(),
              startTimeFormatted: DateTime.fromJSDate(timeslot.startTime.toDate()).toLocaleString(DateTime.DATETIME_SHORT),
            },
            url: `${functions.config().general.host}`,
          })
        });
      }

      // send email to teachers
      // get teachers profile data
      const teacherSnaps = await firestore.collection('teachers')
        .where('schoolId', '==', timeslot.schoolId)
        .get();
      const teachers = await Promise.all(
        teacherSnaps.docs
          .map(doc => doc.id)
          .map(uid => admin.auth().getUser(uid))
      );

      await Promise.all(
        teachers.map(
          teacherUserRecord => sendEmail({
            to: `${teacherUserRecord.displayName} <${teacherUserRecord.email}>`,
            subject: 'Статус додавання уроків: відхилено',
            html: renderTemplate('emails/teacher/admin-deleted-timeslot', {
              school,
              teacher: teacherUserRecord,
              reason,
              timeslot: {
                ...timeslot,
                startTime: timeslot.startTime.toDate(),
                startTimeFormatted: DateTime.fromJSDate(timeslot.startTime.toDate()).toLocaleString(DateTime.DATETIME_SHORT),
              },
              url: `${functions.config().general.host}`,
            })
          }),
        ),
      );

      return;
    }

    const teacherSnap = await firestore.collection('teachers').doc(uid).get();
    if (teacherSnap.exists && teacherSnap.get('schoolId') === timeslot.schoolId) {
      await firestore.collection('timeslots').doc(timeslotId).delete();

      if (timeslot.mentorId) {
        const mentorUserRecord = await admin.auth().getUser(timeslot.mentorId);
        const teacherUserRecord = await admin.auth().getUser(uid);

        await sendEmail({
          to: `${mentorUserRecord.displayName} <${mentorUserRecord.email}>`,
          subject: 'Статус обраних уроків: урок скасовано',
          html: renderTemplate('emails/mentor/teacher-deleted-timeslot', {
            school,
            mentor: mentorUserRecord,
            reason,
            timeslot: {
              ...timeslot,
              startTime: timeslot.startTime.toDate(),
              startTimeFormatted: DateTime.fromJSDate(timeslot.startTime.toDate()).toLocaleString(DateTime.DATETIME_SHORT),
            },
            url: `${functions.config().general.host}`,
          })
        });

        await sendEmailToAdmins(
          'Вчитель видалив урок з ментором',
          'emails/admin/teacher-deleted-timeslot-w-mentor',
          {
            school,
            mentor: mentorUserRecord,
            teacher: teacherUserRecord,
            reason,
            timeslot: {
              ...timeslot,
              startTime: timeslot.startTime.toDate(),
              startTimeFormatted: DateTime.fromJSDate(timeslot.startTime.toDate()).toLocaleString(DateTime.DATETIME_SHORT),
            },
            url: `${functions.config().general.host}/timeslots`,
          }
        );
      }

      return;
    }

    throw new functions.https.HttpsError('permission-denied', 'Access Denied');
  });

const discardTimeslot = functions
  .region('europe-west1')
  .https
  .onCall(async ({ timeslotId, reason }, context) => {
    const uid = context.auth.uid;

    const timeslotSnap = await firestore.collection('timeslots').doc(timeslotId).get();
    if (!timeslotSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Not Found');
    }
    const timeslot = timeslotSnap.data();

    const adminSnap = await firestore.collection('admins').doc(uid).get();
    if (adminSnap.exists) {
      // discard mentor from timeslot
      // await firestore.collection('timeslots').doc(timeslotId).delete();

      // if (timeslot.mentorId) {
      //   // get mentor and send them email
      //   const mentorUserRecord = await admin.auth().getUser(timeslot.mentorId);
      //   await sendEmail({
      //     to: `${mentorUserRecord.displayName} <${mentorUserRecord.email}>`,
      //     subject: 'Статус додавання уроків: видалено',
      //     html: renderTemplate('emails/mentor/admin-deleted-timeslot', {
      //       school,
      //       mentor: mentorUserRecord,
      //       timeslot: {
      //         ...timeslot,
      //         startTime: timeslot.startTime.toDate(),
      //         startTimeFormatted: DateTime.fromJSDate(timeslot.startTime.toDate()).toLocaleString(DateTime.DATETIME_SHORT),
      //       },
      //       url: `${functions.config().general.host}`,
      //     })
      //   });
      // }

      // // send email to teachers
      // // get teachers profile data
      // const teacherSnaps = await firestore.collection('teachers')
      //   .where('schoolId', '==', timeslot.schoolId)
      //   .get();
      // const teachers = await Promise.all(
      //   teacherSnaps.docs
      //     .map(doc => doc.id)
      //     .map(uid => admin.auth().getUser(uid))
      // );

      // await Promise.all(
      //   teachers.map(
      //     teacherUserRecord => sendEmail({
      //       to: `${teacherUserRecord.displayName} <${teacherUserRecord.email}>`,
      //       subject: 'Статус додавання уроків: видалено',
      //       html: renderTemplate('emails/teacher/admin-deleted-timeslot', {
      //         school,
      //         teacher: teacherUserRecord,
      //         timeslot: {
      //           ...timeslot,
      //           startTime: timeslot.startTime.toDate(),
      //           startTimeFormatted: DateTime.fromJSDate(timeslot.startTime.toDate()).toLocaleString(DateTime.DATETIME_SHORT),
      //         },
      //         url: `${functions.config().general.host}`,
      //       })
      //     }),
      //   ),
      // );

      return;
    }

    const mentorSnap = await firestore.collection('mentors').doc(uid).get();
    if (mentorSnap.exists && timeslot.mentorId === uid) {
      // const mentor = await loadUserProfile(uid);

      await firestore.collection('timeslots').doc(timeslotId).update({
        mentorId: null,
        status: TIMESLOT_STATUS_APPROVED,
      });

      const school = await getSchool(timeslot.schoolId);

      const teachers = await getSchoolTeachers(timeslot.schoolId);
      // const { profile: teacher } = teachers[0];

      const mentor = await loadUserProfile(timeslot.mentorId);


      if (timeslot.status === TIMESLOT_STATUS_HAS_MENTOR) {
        // const startTimeFormatted = DateTime.fromJSDate(timeslot.startTime.toDate()).toLocaleString(DateTime.DATETIME_SHORT);
        const startTimeFormatted = DateTime.fromJSDate(timeslot.startTime.toDate()).toFormat('dd-MM-yyyy HH:mm');

        // send email to teacher
        await Promise.all(
          teachers.map(t => t.profile).map(
            teacher => sendEmail({
              to: `${teacher.firstName} ${teacher.lastName} <${teacher.email}>`,
              subject: 'Ментор відхилив заявку',
              html: renderTemplate('emails/teacher/mentor-discarded-timeslot', {
                school,
                mentor,
                reason,
                teacher,
                timeslot: {
                  ...timeslot,
                  startTime: timeslot.startTime.toDate(),
                  startTimeFormatted,
                },
                url: `${functions.config().general.host}`,
              })
            }),
          ),
        );

        await sendEmailToAdmins(
          'Ментор відмінив участь в уроці',
          'emails/admin/mentor-discarded-timeslot',
          {
            school,
            reason,
            mentor,
            timeslot: {
              ...timeslot,
              startTime: timeslot.startTime.toDate(),
              startTimeFormatted,
            },
            url: `${functions.config().general.host}/timeslots`,
          }
        );


        const slackTimeLimit = DateTime.local().plus({ days: 2 });
        if (timeslot.startTime.toDate() <= slackTimeLimit.toJSDate()) {
          const slackWebhookUrl = functions.config().slack['mentor-discarded-timeslot'];
          await rp({
            url: slackWebhookUrl,
            method: 'POST',
            body: {
              attachments: [
                {
                  fallback: '[УВАГА] Ментор відмінив участь в уроці',
                  pretext: '[УВАГА] Ментор відмінив участь в уроці',
                  color: '#f44336',
                  title: 'Інформація про урок',
                  text: [
                    `Школа: ${school.name}`,
                    `Адреса: ${school.city} ${school.addressStreet}, ${school.addressBuilding}`,
                    `Час проведення: ${startTimeFormatted}`,
                    `Клас: ${timeslot.class}`,
                    `Кількість учнів: ${timeslot.pupilsCount}`,
                    timeslot.notes ? `Коментар ментору: ${timeslot.notes}` : '',
                  ].filter(v => v).join('\n'),
                  // text: 'Школа: №60 СЗШ\nЧас проведення: 12/4/2018, 12:30 PM\nКлас: 7В\nКількість учнів: 27',
                },
              ],
            },
            json: true,
          });
        }
      }
      // if (timeslot.mentorId) {
      //   const mentorUserRecord = await admin.auth().getUser(timeslot.mentorId);
      //   const teacherUserRecord = await admin.auth().getUser(uid);



      return;
    }

    throw new functions.https.HttpsError('permission-denied', 'Access Denied');
  });

const applyTimeslot = functions
  .region('europe-west1')
  .https
  .onCall(async (timeslotId, context) => {
    const uid = context.auth.uid;

    const mentorSnap = await firestore.collection('mentors').doc(uid).get();
    if (!mentorSnap.exists) {
      throw new functions.https.HttpsError('permission-denied', 'Access Denied');
    }

    const timeslotRef = firestore.collection('timeslots').doc(timeslotId);

    await firestore.runTransaction(async (transaction) => {
      const doc = await transaction.get(timeslotRef);

      if (!doc.exists) {
        throw new functions.https.HttpsError('not-found', 'Document does not exist!');
      }

      const docData = doc.data();

      if (docData.mentorId) {
        throw new functions.https.HttpsError('already-has-mentor', 'Timeslot already has a mentor!');
      }

      if (docData.status !== TIMESLOT_STATUS_NEEDS_MENTOR) {
        throw new functions.https.HttpsError('aborted', 'You can\'t apply at the moment!');
      }

      return transaction.update(timeslotRef, {
        mentorId: uid,
        status: TIMESLOT_STATUS_MENTOR_NEEDS_APPROVE,
      });
    });
  });

const sendTimeslotReminders = functions
  .region('europe-west1')
  .pubsub
  .schedule('*/5 * * * *')
  .timeZone('Europe/Kiev')
  .onRun(async (context) => {
    const time = DateTime.utc();
    const timeFrom = time.set({ seconds: 0, milliseconds: 0 }).plus({ days: 1 });
    const timeTo = timeFrom.plus({ minutes: 5 });

    const from = admin.firestore.Timestamp.fromDate(timeFrom.toJSDate());
    const to = admin.firestore.Timestamp.fromDate(timeTo.toJSDate());

    const timeslotsSnaps = await firestore.collection('timeslots')
      .where('status', '==', TIMESLOT_STATUS_HAS_MENTOR)
      .where('startTime', '>=', from)
      .where('startTime', '<', to)
      .get();

    const timeslots = timeslotsSnaps.docs
      .map(snap => ({ ...snap.data(), id: snap.id }))
      .filter(t => t.mentorId)
      .map(timeslot => ({
        ...timeslot,
        startTime: timeslot.startTime.toDate(),
      }));

    const mentorIds = timeslots.filter(t => t.mentorId).map(t => t.mentorId);
    const mentors = await Promise.all(mentorIds.map(uid => loadUserProfile(uid)));

    const schoolIds = timeslots.map(t => t.schoolId);
    const schools = await Promise.all(schoolIds.map(id => getSchool(id)));

    const timeslotsAggregated = timeslots.map((t) => {
      if (!t.mentorId) {
        return t;
      }

      const mentor = mentors.find(m => m.uid === t.mentorId);
      const school = schools.find(s => s.id === t.schoolId);

      return { ...t, mentor, school };
    });

    // console.log(timeslotsAggregated);

    await Promise.all(
      timeslotsAggregated.map(
        timeslot => sendEmail({
          to: `${timeslot.mentor.firstName} ${timeslot.mentor.lastName} <${timeslot.mentor.email}>`,
          // to: `${timeslot.mentor.firstName} ${timeslot.mentor.lastName} <oleksandr.pidlisnyi@gmail.com>`,
          subject: 'Ментор, не проґав урок!',
          html: renderTemplate('emails/mentor/timeslot-reminder-24h', {
            school: timeslot.school,
            // teacher: teacherUserRecord,
            mentor: {
              ...timeslot.mentor,
              displayName: `${timeslot.mentor.firstName} ${timeslot.mentor.lastName}`,
            },
            timeslot: {
              ...timeslot,
              startTimeFormatted: DateTime.fromJSDate(timeslot.startTime).toLocaleString(DateTime.DATETIME_SHORT),
            },
            url: `${functions.config().general.host}`,
          })
        }),
      ),
    );

    return true;
  });

const generateReport = functions
  .region('europe-west1')
  .https
  .onCall(async ({ reportId }, context) => {
    switch (reportId) {
      case 'school-stats':
        return reportSchoolStats();
      default:
        throw new Error('Wrong Report');
    }
  });

export {
  applyTimeslot,
  emailTeacherApproved,
  emailTeacherNeedsApprove,
  timeslotUpdated,
  timeslotMentorApproved,
  updateSchoolsTimeslotsCount,
  userCleanup,
  deleteTimeslot,
  discardTimeslot,
  updateMentorTimeslotsCount,
  // sendTimeslotReminders,
  sendTimeslotReminders,

  generateReport,
};
