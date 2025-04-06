import React, { useEffect } from 'react'

import {
  createEntity,
  EntityTreeComponent,
  EntityUUID,
  getComponent,
  getOptionalComponent,
  removeComponent,
  removeEntity,
  setComponent,
  UndefinedEntity,
  useOptionalComponent,
  UUIDComponent
} from '@ir-engine/ecs'
import { GLTFComponent } from '@ir-engine/engine/src/gltf/GLTFComponent'
import { SourceComponent } from '@ir-engine/engine/src/scene/components/SourceComponent'
import {
  defineAction,
  defineState,
  getMutableState,
  matches,
  none,
  useHookstate,
  useMutableState
} from '@ir-engine/hyperflux'
import { WorldNetworkAction } from '@ir-engine/network'
import { NameComponent } from '@ir-engine/spatial/src/common/NameComponent'
import { ColliderComponent } from '@ir-engine/spatial/src/physics/components/ColliderComponent'
import { RigidBodyComponent } from '@ir-engine/spatial/src/physics/components/RigidBodyComponent'
import { BodyTypes, Shapes } from '@ir-engine/spatial/src/physics/types/PhysicsTypes'
import { MeshComponent } from '@ir-engine/spatial/src/renderer/components/MeshComponent'
import { VisibleComponent } from '@ir-engine/spatial/src/renderer/components/VisibleComponent'
import { TransformComponent } from '@ir-engine/spatial/src/transform/components/TransformComponent'
import { SpawnObjectActions } from '@ir-engine/spatial/src/transform/SpawnObjectActions'
import { Box3, Vector3 } from 'three'

export const ItemAction = {
  spawn: defineAction(
    SpawnObjectActions.spawnObject.extend({
      type: 'hexafield.rpg-tools.ItemAction.spawn',
      itemType: matches.string,
      name: matches.string,
      modelURL: matches.string
    })
  )
}

globalThis.ItemAction = ItemAction

export interface ItemType {
  type: string
  name: string
  modelURL: string
}

export const ItemState = defineState({
  name: 'hexafield.rpg-tools.ItemState',

  initial: {} as Record<EntityUUID, ItemType>,

  receptors: {
    onSpawn: ItemAction.spawn.receive((action) => {
      getMutableState(ItemState)[action.entityUUID].set({
        type: action.itemType,
        name: action.name,
        modelURL: action.modelURL
      })
    }),
    onDestroyObject: WorldNetworkAction.destroyEntity.receive((action) => {
      getMutableState(ItemState)[action.entityUUID].set(none)
    })
  },

  reactor: () => {
    const itemState = useMutableState(ItemState)
    return (
      <>
        {itemState.keys.map((entityUUID: EntityUUID) => (
          <AvatarReactor key={entityUUID} entityUUID={entityUUID} />
        ))}
      </>
    )
  }
})

const AvatarReactor = ({ entityUUID }: { entityUUID: EntityUUID }) => {
  const { modelURL, name } = useHookstate(getMutableState(ItemState)[entityUUID]).value
  const entity = UUIDComponent.useEntityByUUID(entityUUID)

  useEffect(() => {
    if (!entity) return
    setComponent(entity, NameComponent, name)
    setComponent(entity, VisibleComponent, name)
  }, [entity])

  // wait for spawn system to create entity
  const hasTransformComponent = useOptionalComponent(entity, TransformComponent)

  const modelEntityState = useHookstate(UndefinedEntity)

  useEffect(() => {
    if (!entity || !hasTransformComponent) return
    const modelEntity = createEntity()
    setComponent(entity, NameComponent, name)
    setComponent(modelEntity, UUIDComponent, UUIDComponent.generateUUID())
    setComponent(modelEntity, TransformComponent)
    setComponent(modelEntity, EntityTreeComponent, { parentEntity: entity })
    setComponent(modelEntity, NameComponent, getComponent(entity, NameComponent) + ' Model')
    setComponent(modelEntity, VisibleComponent)
    setComponent(modelEntity, GLTFComponent, { src: modelURL })
    modelEntityState.set(modelEntity)
    return () => {
      removeEntity(modelEntity)
      modelEntityState.set(UndefinedEntity)
    }
  }, [entity, hasTransformComponent, modelURL])

  const modelLoaded = GLTFComponent.useSceneLoaded(modelEntityState.value)

  useEffect(() => {
    if (!modelLoaded) return

    const box = new Box3()
    const entities = SourceComponent.getEntitiesBySource(GLTFComponent.getInstanceID(modelEntityState.value))
    for (const entity of entities) {
      const mesh = getOptionalComponent(entity, MeshComponent)
      if (!mesh) continue
      box.expandByObject(mesh)
    }

    console.log(box)
    setComponent(entity, RigidBodyComponent, { type: BodyTypes.Kinematic })

    const colliderEntity = createEntity()
    setComponent(colliderEntity, UUIDComponent, UUIDComponent.generateUUID())
    setComponent(colliderEntity, TransformComponent, {
      scale: box.getSize(new Vector3()).multiplyScalar(0.5 * 1.5) // half-extents * 1.5 times the size of the model to float above the ground
    })
    setComponent(colliderEntity, EntityTreeComponent, { parentEntity: entity })
    setComponent(colliderEntity, NameComponent, getComponent(entity, NameComponent) + ' Collider')
    setComponent(colliderEntity, VisibleComponent)
    setComponent(colliderEntity, ColliderComponent, { shape: Shapes.Box })

    return () => {
      removeEntity(colliderEntity)
      removeComponent(entity, RigidBodyComponent)
    }
  }, [modelLoaded])

  return null
}
