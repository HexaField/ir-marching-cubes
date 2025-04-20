import { useEffect } from 'react'

import {
  createEntity,
  Entity,
  EntityTreeComponent,
  getComponent,
  getOptionalComponent,
  removeComponent,
  removeEntity,
  S,
  setComponent,
  UndefinedEntity,
  UUIDComponent
} from '@ir-engine/ecs'
import { GLTFComponent } from '@ir-engine/engine/src/gltf/GLTFComponent'
import { SourceComponent } from '@ir-engine/engine/src/scene/components/SourceComponent'
import { definePrefab } from '@ir-engine/engine/src/scene/functions/definePrefab'
import { useHookstate } from '@ir-engine/hyperflux'
import { NameComponent } from '@ir-engine/spatial/src/common/NameComponent'
import { ColliderComponent } from '@ir-engine/spatial/src/physics/components/ColliderComponent'
import { RigidBodyComponent } from '@ir-engine/spatial/src/physics/components/RigidBodyComponent'
import { BodyTypes, Shapes } from '@ir-engine/spatial/src/physics/types/PhysicsTypes'
import { MeshComponent } from '@ir-engine/spatial/src/renderer/components/MeshComponent'
import { VisibleComponent } from '@ir-engine/spatial/src/renderer/components/VisibleComponent'
import { TransformComponent } from '@ir-engine/spatial/src/transform/components/TransformComponent'
import { Box3, Vector3 } from 'three'

const ItemReactor = (props: { entity: Entity; prefab: { type: string; name: string; modelURL: string } }) => {
  const { modelURL, name } = props.prefab
  const entity = props.entity

  useEffect(() => {
    setComponent(entity, NameComponent, name)
    setComponent(entity, VisibleComponent, name)
  }, [])

  const modelEntityState = useHookstate(UndefinedEntity)

  useEffect(() => {
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
  }, [modelURL])

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

    setComponent(entity, RigidBodyComponent, { type: BodyTypes.Dynamic })

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

export const ItemPrefabComponent = definePrefab({
  name: 'ItemPrefab',
  schema: S.Object({
    type: S.String(),
    name: S.String(),
    modelURL: S.String()
  }),
  jsonID: 'RPG_item',
  reactor: ItemReactor
})
